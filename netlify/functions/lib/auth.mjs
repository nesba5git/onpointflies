import { createRemoteJWKSet, jwtVerify, decodeJwt } from 'jose';
import { getUserStore, initBlobsContext } from './db.mjs';

const AUTH0_DOMAIN = (process.env.AUTH0_DOMAIN || '').trim();
const AUTH0_CLIENT_ID = (process.env.AUTH0_CLIENT_ID || '').trim();
const JWKS = AUTH0_DOMAIN
  ? createRemoteJWKSet(
      new URL(`https://${AUTH0_DOMAIN}/.well-known/jwks.json`)
    )
  : null;

/**
 * Fetch the user's email from Auth0's /userinfo endpoint using the access
 * token.  This is the OIDC-standard fallback when the email claim is not
 * present in the ID token (common with some Auth0 connection types).
 */
async function fetchEmailFromUserInfo(accessToken, expectedSub) {
  if (!accessToken || !AUTH0_DOMAIN) {
    console.log('[auth] /userinfo skip: accessToken=' + (accessToken ? 'present' : 'missing') + ', domain=' + (AUTH0_DOMAIN ? 'present' : 'missing'));
    return undefined;
  }
  try {
    console.log('[auth] Calling /userinfo endpoint for email fallback...');
    const resp = await fetch(`https://${AUTH0_DOMAIN}/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) {
      console.error('[auth] /userinfo returned HTTP', resp.status);
      return undefined;
    }
    const data = await resp.json();
    console.log('[auth] /userinfo response keys:', Object.keys(data).join(', '));
    // Verify the access token belongs to the same user as the ID token
    if (expectedSub && data.sub && data.sub !== expectedSub) {
      console.error('[auth] /userinfo sub mismatch:', data.sub, '!=', expectedSub);
      return undefined;
    }
    if (data.email) {
      console.log('[auth] /userinfo returned email:', data.email);
    } else {
      console.warn('[auth] /userinfo response had no email field');
    }
    return data.email || undefined;
  } catch (err) {
    console.error('[auth] /userinfo fallback failed:', err.message);
    return undefined;
  }
}

/**
 * Parse the ADMIN_EMAILS env var into a list of admin identifiers.
 * Accepts comma, semicolon, pipe, or newline as separators.
 * Each entry is trimmed, lowercased, and stripped of non-printable chars.
 * Entries can be email addresses OR Auth0 user IDs (sub values).
 */
export function getAdminEmails() {
  const raw = process.env.ADMIN_EMAILS || '';
  return raw
    .split(/[,;\|\n]+/)
    .map(e => e.replace(/[^\x20-\x7E]/g, '').trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Check whether a user (identified by email and/or Auth0 sub) is an admin.
 * Matches against the ADMIN_EMAILS env var which can contain either email
 * addresses or Auth0 user IDs (sub values like "auth0|abc123").
 * Returns 'admin' or 'user'.
 */
export function getRoleForEmail(email, sub) {
  const admins = getAdminEmails();
  if (!admins.length) {
    console.warn('[auth] ADMIN_EMAILS env var is empty — no admin emails configured');
    return 'user';
  }
  if (email && admins.includes(email.toLowerCase())) {
    console.log('[auth] getRoleForEmail: email "' + email + '" matches ADMIN_EMAILS → admin');
    return 'admin';
  }
  if (sub && admins.includes(sub.toLowerCase())) {
    console.log('[auth] getRoleForEmail: sub "' + sub + '" matches ADMIN_EMAILS → admin');
    return 'admin';
  }
  console.log('[auth] getRoleForEmail: no match. email="' + (email || '(none)') + '", sub="' + (sub || '(none)') + '", adminEntries=' + admins.length);
  return 'user';
}

/**
 * Extract the email from a JWT payload, checking both the standard `email`
 * claim and any namespaced claim ending with `/email`.
 * Falls back to `name` or `nickname` if they look like email addresses
 * (common with Auth0 database connections where username IS the email).
 */
function extractEmail(payload) {
  if (payload.email) {
    console.log('[auth] extractEmail: found standard email claim');
    return payload.email;
  }
  for (const key of Object.keys(payload)) {
    if (key.endsWith('/email') && payload[key]) {
      console.log('[auth] extractEmail: found namespaced email in claim "' + key + '"');
      return payload[key];
    }
  }
  // Fallback: some Auth0 connections store the email as the name/nickname
  // or in other standard OIDC claims like preferred_username
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (payload.preferred_username && emailRegex.test(payload.preferred_username)) {
    console.log('[auth] extractEmail: found email-like preferred_username');
    return payload.preferred_username;
  }
  if (payload.name && emailRegex.test(payload.name)) {
    console.log('[auth] extractEmail: found email-like name');
    return payload.name;
  }
  if (payload.nickname && emailRegex.test(payload.nickname)) {
    console.log('[auth] extractEmail: found email-like nickname');
    return payload.nickname;
  }
  console.warn('[auth] extractEmail: no email found in token. Claims present:', Object.keys(payload).join(', '));
  return undefined;
}

export async function verifyAuth(event) {
  const result = await verifyAuthDetailed(event);
  return result.user || null;
}

/**
 * Like verifyAuth but returns { user, error, errorCode } so callers can
 * distinguish between "no token", "expired token", and "invalid token".
 */
export async function verifyAuthDetailed(event) {
  const authHeader =
    event.headers.authorization || event.headers.Authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    console.warn('[auth] No Bearer token in Authorization header');
    return { user: null, error: 'No Bearer token provided', errorCode: 'no_token' };
  }

  if (!JWKS || !AUTH0_DOMAIN || !AUTH0_CLIENT_ID) {
    console.error('[auth] CRITICAL: Auth0 not configured — AUTH0_DOMAIN=' + (AUTH0_DOMAIN ? 'set' : 'MISSING') + ', AUTH0_CLIENT_ID=' + (AUTH0_CLIENT_ID ? 'set' : 'MISSING'));
    return { user: null, error: 'Auth0 not configured on the server', errorCode: 'server_config' };
  }

  const token = authHeader.split(' ')[1];
  console.log('[auth] Verifying JWT token (length=' + token.length + ')...');

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://${AUTH0_DOMAIN}/`,
      audience: AUTH0_CLIENT_ID,
      clockTolerance: 60,   // tolerate up to 60 s of clock skew
    });
    console.log('[auth] JWT verified successfully. sub=' + payload.sub);
    console.log('[auth] Token claims:', Object.keys(payload).join(', '));

    let email = extractEmail(payload);

    // If the email is still missing, try the Auth0 /userinfo endpoint as a
    // fallback using the access token the client may have forwarded.
    if (!email) {
      const accessToken =
        event.headers['x-access-token'] || event.headers['X-Access-Token'] || '';
      console.log('[auth] No email in token. X-Access-Token header ' + (accessToken ? 'present (length=' + accessToken.length + ')' : 'MISSING'));
      if (accessToken) {
        email = await fetchEmailFromUserInfo(accessToken, payload.sub);
        if (email) {
          console.log('[auth] Email recovered from /userinfo fallback:', email);
        }
      }
    }

    if (!email) {
      console.error('[auth] JWT verified but NO email found anywhere.');
      console.error('[auth] sub:', payload.sub);
      console.error('[auth] To fix: ensure ADMIN_EMAILS contains the Auth0 user ID: ' + payload.sub);
    } else {
      console.log('[auth] Final email for user:', email);
    }
    return {
      user: {
        sub: payload.sub,
        email,
        name: payload.name || payload.nickname,
        picture: payload.picture,
      },
    };
  } catch (err) {
    const code = err?.code || '';
    console.error('[auth] Token verification FAILED:', code, err.message);

    // Try to decode (without verifying) to log which user is affected
    let hint = '';
    try {
      const claims = decodeJwt(token);
      hint = claims.email || extractEmail(claims) || claims.sub || '';
      console.error('[auth] Decoded (unverified) token — iss:', claims.iss, 'aud:', claims.aud, 'sub:', claims.sub);
      console.error('[auth] Expected issuer:', `https://${AUTH0_DOMAIN}/`, 'Expected audience:', AUTH0_CLIENT_ID);
    } catch { /* ignore decode errors */ }
    if (hint) console.error('[auth] Token belonged to:', hint);

    if (code === 'ERR_JWT_EXPIRED') {
      return { user: null, error: 'Token has expired — please log in again', errorCode: 'token_expired' };
    }
    return { user: null, error: 'Token verification failed: ' + err.message, errorCode: 'token_invalid' };
  }
}

/**
 * Verify the request is authenticated AND the user has the 'admin' role.
 * Returns the user object (with role) if admin, null otherwise.
 *
 * Three-tier check:
 * 1. ADMIN_EMAILS env var against current token email/sub
 * 2. ADMIN_EMAILS env var against stored email from Blobs (handles missing email in token)
 * 3. Persisted role in Blobs (assigned via the admin Users panel)
 */
export async function verifyAdmin(event) {
  const user = await verifyAuth(event);
  if (!user) {
    console.warn('[verifyAdmin] Auth failed — no valid user');
    return null;
  }

  console.log('[verifyAdmin] Checking admin status for sub=' + user.sub + ', email=' + (user.email || '(none)'));

  // 1. Env-based check — fast and always available (checks both email and sub)
  if (getRoleForEmail(user.email, user.sub) === 'admin') {
    console.log('[verifyAdmin] GRANTED via ADMIN_EMAILS env var (token email/sub)');
    return { ...user, role: 'admin' };
  }

  // 2-3. Check Blobs — stored email and persisted role
  try {
    initBlobsContext(event);
    const store = getUserStore();
    const stored = await store.get(user.sub, { type: 'json' });

    if (stored) {
      console.log('[verifyAdmin] Found stored user record: email=' + (stored.email || '(none)') + ', role=' + (stored.role || '(none)'));

      // 2. If current token has no email, try stored email against ADMIN_EMAILS
      if (!user.email && stored.email) {
        console.log('[verifyAdmin] Token missing email, checking stored email "' + stored.email + '" against ADMIN_EMAILS');
        if (getRoleForEmail(stored.email, user.sub) === 'admin') {
          console.log('[verifyAdmin] GRANTED via ADMIN_EMAILS env var (stored email from Blobs)');
          return { ...user, email: stored.email, role: 'admin' };
        }
      }

      // 3. Persisted role in Blobs (assigned via the admin Users panel)
      if (stored.role === 'admin') {
        console.log('[verifyAdmin] GRANTED via persisted role in Blobs');
        return { ...user, role: 'admin' };
      }
    } else {
      console.log('[verifyAdmin] No stored user record found for sub=' + user.sub);
    }
  } catch (err) {
    console.error('[verifyAdmin] Blobs read error (non-fatal):', err.message);
  }

  console.warn('[verifyAdmin] DENIED for sub=' + user.sub + ', email=' + (user.email || '(none)'));
  return null;
}

export function respond(data, statusCode = 200) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Access-Token',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    },
    body: JSON.stringify(data),
  };
}
