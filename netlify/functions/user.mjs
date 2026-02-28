import { getUserStore, initBlobsContext } from './lib/db.mjs';
import { verifyAuthDetailed, respond, getRoleForEmail, getAdminEmails } from './lib/auth.mjs';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return respond({}, 204);
  }

  const { user, error, errorCode } = await verifyAuthDetailed(event);
  if (!user) {
    return respond({ error: error || 'Unauthorized', errorCode: errorCode || 'auth_failed' }, 401);
  }

  if (!user.email) {
    console.error('No email claim in token for user:', user.sub);
    console.error('This usually means Auth0 is not including the email in the ID token.');
    console.error('Fix: In Auth0 Dashboard → Actions → Flows → Login, add an Action that sets the email claim.');
  }

  // Determine role from ADMIN_EMAILS env var first — this must never be
  // blocked by a Blobs failure so it lives outside the try/catch.
  const adminEmails = getAdminEmails();
  const envRole = getRoleForEmail(user.email);
  console.log('[user] email from token:', user.email || '(missing)');
  console.log('[user] ADMIN_EMAILS configured:', adminEmails.length > 0);
  console.log('[user] envRole:', envRole);

  // Try to read/write the persistent user record in Blobs.  If Blobs is
  // unavailable we still return the env-based role so admins are never
  // locked out.
  let existing = null;
  let store = null;
  try {
    initBlobsContext(event);
    store = getUserStore();
    existing = await store.get(user.sub, { type: 'json' });
  } catch (err) {
    console.error('Blobs read error (non-fatal):', err.message);
  }

  const role = envRole === 'admin' ? 'admin' : (existing?.role || 'user');

  // Include diagnosis info so the frontend can explain why access was denied
  const _diagnosis = {
    emailInToken: !!user.email,
    adminEmailsConfigured: adminEmails.length > 0,
    emailMatchesAdminList: envRole === 'admin',
    roleSource: envRole === 'admin' ? 'env' : (existing?.role === 'admin' ? 'blobs' : 'default'),
  };

  const userRecord = {
    auth0_id: user.sub,
    email: user.email,
    name: user.name,
    picture: user.picture,
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
    } catch (err) {
      console.error('Blobs write error (non-fatal):', err.message);
    }
  }

  return respond(userRecord);
};
