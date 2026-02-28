import { getUserStore, initBlobsContext } from './lib/db.mjs';
import { verifyAuthDetailed, respond, getRoleForEmail, getAdminEmails } from './lib/auth.mjs';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return respond({}, 204);
  }

  console.log('[user] ===== /api/user request start =====');

  const { user, error, errorCode } = await verifyAuthDetailed(event);
  if (!user) {
    console.error('[user] Auth failed:', error, '(code:', errorCode + ')');
    return respond({ error: error || 'Unauthorized', errorCode: errorCode || 'auth_failed' }, 401);
  }

  console.log('[user] Auth succeeded. sub=' + user.sub + ', email=' + (user.email || '(MISSING)'));

  if (!user.email) {
    console.error('[user] WARNING: No email claim in token for user:', user.sub);
    console.error('[user] This usually means Auth0 is not including the email in the ID token.');
    console.error('[user] The system will try to use the stored email from a previous login.');
  }

  // Determine role from ADMIN_EMAILS env var first — this must never be
  // blocked by a Blobs failure so it lives outside the try/catch.
  const adminEmails = getAdminEmails();
  const envRole = getRoleForEmail(user.email, user.sub);
  console.log('[user] email from token:', user.email || '(missing)');
  console.log('[user] sub:', user.sub || '(missing)');
  console.log('[user] ADMIN_EMAILS configured:', adminEmails.length > 0, '(' + adminEmails.length + ' entries)');
  console.log('[user] envRole (from current token):', envRole);

  // Try to read/write the persistent user record in Blobs.  If Blobs is
  // unavailable we still return the env-based role so admins are never
  // locked out.
  let existing = null;
  let store = null;
  try {
    initBlobsContext(event);
    store = getUserStore();
    existing = await store.get(user.sub, { type: 'json' });
    if (existing) {
      console.log('[user] Found existing user record: email=' + (existing.email || '(none)') + ', role=' + (existing.role || '(none)'));
    } else {
      console.log('[user] No existing user record — this is a new user');
    }
  } catch (err) {
    console.error('[user] Blobs read error (non-fatal):', err.message);
  }

  // Determine the effective email: prefer current token, fall back to stored
  const effectiveEmail = user.email || (existing && existing.email) || undefined;
  if (!user.email && effectiveEmail) {
    console.log('[user] Using stored email from previous login: ' + effectiveEmail);
  }

  // Re-check admin status using the effective email (stored email fallback)
  let role;
  if (envRole === 'admin') {
    role = 'admin';
    console.log('[user] Role = admin (matched via current token email/sub)');
  } else if (effectiveEmail && effectiveEmail !== user.email) {
    // Current token had no email but we have a stored email — check it
    const storedEmailRole = getRoleForEmail(effectiveEmail, user.sub);
    if (storedEmailRole === 'admin') {
      role = 'admin';
      console.log('[user] Role = admin (matched via stored email from Blobs)');
    } else {
      role = existing?.role || 'user';
      console.log('[user] Role = ' + role + ' (stored email did not match ADMIN_EMAILS either, using persisted role)');
    }
  } else {
    role = existing?.role || 'user';
    console.log('[user] Role = ' + role + ' (from ' + (existing?.role ? 'persisted Blobs record' : 'default') + ')');
  }

  // Determine role source for diagnosis
  let roleSource = 'default';
  if (envRole === 'admin') {
    roleSource = 'env';
  } else if (effectiveEmail && effectiveEmail !== user.email && getRoleForEmail(effectiveEmail, user.sub) === 'admin') {
    roleSource = 'env_stored_email';
  } else if (existing?.role === 'admin') {
    roleSource = 'blobs';
  }

  // Include diagnosis info so the frontend can explain why access was denied
  const _diagnosis = {
    emailInToken: !!user.email,
    subInToken: !!user.sub,
    sub: user.sub,
    effectiveEmail: effectiveEmail || null,
    storedEmail: (existing && existing.email) || null,
    adminEmailsConfigured: adminEmails.length > 0,
    adminEntriesCount: adminEmails.length,
    emailMatchesAdminList: !!(effectiveEmail && adminEmails.includes(effectiveEmail.toLowerCase())),
    subMatchesAdminList: !!(user.sub && adminEmails.includes(user.sub.toLowerCase())),
    roleSource,
    tokenClaims: user.email ? 'has_email' : 'no_email',
  };

  console.log('[user] Diagnosis:', JSON.stringify(_diagnosis));

  const userRecord = {
    auth0_id: user.sub,
    // IMPORTANT: preserve stored email if current token has none
    email: effectiveEmail,
    name: user.name || (existing && existing.name),
    picture: user.picture || (existing && existing.picture),
    role,
    _diagnosis,
    ...(existing ? {} : { created_at: new Date().toISOString() }),
    updated_at: new Date().toISOString(),
  };

  // Merge any extra fields from the existing record (e.g. preferences)
  if (existing) {
    Object.keys(existing).forEach((key) => {
      if (!(key in userRecord)) userRecord[key] = existing[key];
    });
  }

  // Persist — best-effort; failure must not block the response
  if (store) {
    try {
      await store.setJSON(user.sub, userRecord);
      console.log('[user] User record persisted to Blobs');
    } catch (err) {
      console.error('[user] Blobs write error (non-fatal):', err.message);
    }
  }

  console.log('[user] Returning role=' + role + ' for email=' + (effectiveEmail || '(none)'));
  console.log('[user] ===== /api/user request complete =====');
  return respond(userRecord);
};
