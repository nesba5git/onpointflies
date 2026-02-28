import { getUserStore, initBlobsContext } from './lib/db.mjs';
import { verifyAuthDetailed, respond, getAdminEmails, getRoleForEmail } from './lib/auth.mjs';

/**
 * Diagnostic endpoint for troubleshooting auth and admin access issues.
 * Returns detailed information about the current auth state.
 *
 * GET /api/auth-debug — returns auth diagnostic info (requires valid token)
 */
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return respond({}, 204);
  }

  console.log('[auth-debug] ===== Diagnostic request =====');

  const diagnostics = {
    timestamp: new Date().toISOString(),
    environment: {
      AUTH0_DOMAIN_SET: !!(process.env.AUTH0_DOMAIN || '').trim(),
      AUTH0_CLIENT_ID_SET: !!(process.env.AUTH0_CLIENT_ID || '').trim(),
      ADMIN_EMAILS_SET: !!(process.env.ADMIN_EMAILS || '').trim(),
      ADMIN_EMAILS_COUNT: getAdminEmails().length,
      NODE_VERSION: process.version,
    },
    headers: {
      hasAuthorization: !!(event.headers.authorization || event.headers.Authorization),
      hasXAccessToken: !!(event.headers['x-access-token'] || event.headers['X-Access-Token']),
    },
    auth: null,
    user: null,
    adminCheck: null,
    blobsStatus: null,
  };

  // Test auth
  const { user, error, errorCode } = await verifyAuthDetailed(event);
  if (!user) {
    diagnostics.auth = { success: false, error, errorCode };
    console.log('[auth-debug] Auth failed:', error);
    return respond(diagnostics);
  }

  diagnostics.auth = {
    success: true,
    sub: user.sub,
    emailInToken: !!user.email,
    email: user.email || null,
    name: user.name || null,
  };

  // Test ADMIN_EMAILS match
  const adminEmails = getAdminEmails();
  const envRole = getRoleForEmail(user.email, user.sub);
  diagnostics.adminCheck = {
    envRole,
    emailChecked: user.email || '(none)',
    subChecked: user.sub,
    emailMatch: !!(user.email && adminEmails.includes(user.email.toLowerCase())),
    subMatch: !!(user.sub && adminEmails.includes(user.sub.toLowerCase())),
  };

  // Test Blobs access
  try {
    initBlobsContext(event);
    const store = getUserStore();
    const stored = await store.get(user.sub, { type: 'json' });
    diagnostics.blobsStatus = {
      accessible: true,
      userRecordExists: !!stored,
      storedEmail: stored?.email || null,
      storedRole: stored?.role || null,
    };

    // If stored email differs from token email, check stored email too
    if (stored?.email && stored.email !== user.email) {
      diagnostics.adminCheck.storedEmailRole = getRoleForEmail(stored.email, user.sub);
      diagnostics.adminCheck.storedEmail = stored.email;
    }
  } catch (err) {
    diagnostics.blobsStatus = {
      accessible: false,
      error: err.message,
    };
  }

  // Final role determination (same logic as user.mjs)
  const effectiveEmail = user.email || diagnostics.blobsStatus?.storedEmail || null;
  let finalRole = 'user';
  let roleReason = 'default';

  if (envRole === 'admin') {
    finalRole = 'admin';
    roleReason = 'ADMIN_EMAILS matched token email/sub';
  } else if (effectiveEmail && effectiveEmail !== user.email) {
    if (getRoleForEmail(effectiveEmail, user.sub) === 'admin') {
      finalRole = 'admin';
      roleReason = 'ADMIN_EMAILS matched stored email from Blobs';
    }
  }
  if (finalRole !== 'admin' && diagnostics.blobsStatus?.storedRole === 'admin') {
    finalRole = 'admin';
    roleReason = 'Persisted admin role in Blobs';
  }

  diagnostics.result = {
    finalRole,
    roleReason,
    effectiveEmail,
    wouldGetAdminAccess: finalRole === 'admin',
  };

  // Provide actionable hints
  diagnostics.hints = [];
  if (!diagnostics.auth.emailInToken) {
    diagnostics.hints.push('Email is MISSING from the Auth0 ID token. Add your Auth0 user ID to ADMIN_EMAILS: ' + user.sub);
    diagnostics.hints.push('Or configure Auth0 to include email in the ID token (Actions → Login Flow)');
  }
  if (!diagnostics.environment.ADMIN_EMAILS_SET) {
    diagnostics.hints.push('ADMIN_EMAILS env var is not configured. Set it in Netlify site settings.');
  }
  if (diagnostics.auth.emailInToken && diagnostics.environment.ADMIN_EMAILS_SET && !diagnostics.adminCheck.emailMatch && !diagnostics.adminCheck.subMatch) {
    diagnostics.hints.push('Your email "' + user.email + '" does not match any entry in ADMIN_EMAILS. Ensure ADMIN_EMAILS contains: ' + user.email + ' or ' + user.sub);
  }
  if (finalRole === 'admin') {
    diagnostics.hints.push('Admin access WILL be granted. Reason: ' + roleReason);
  }

  console.log('[auth-debug] Diagnostics:', JSON.stringify(diagnostics, null, 2));
  return respond(diagnostics);
};
