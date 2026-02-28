import { createRemoteJWKSet, jwtVerify, decodeJwt } from 'jose';
import { getUserStore } from './db.mjs';

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
 *
 * @param {string} accessToken – opaque or JWT access token from Auth0
 * @param {string} expectedSub – the `sub` from the verified ID token, used to
 *   ensure the access token belongs to the same user (prevents token-swap
 *   attacks).
 */
async function fetchEmailFromUserInfo(accessToken, expectedSub) {
  if (!accessToken || !AUTH0_DOMAIN) return undefined;
  try {
    const resp = await fetch(`https://${AUTH0_DOMAIN}/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) {
      console.error('[auth] /userinfo returned', resp.status);
      return undefined;
    }
    const data = await resp.json();
    // Verify the access token belongs to the same user as the ID token
    if (expectedSub && data.sub && data.sub !== expectedSub) {
      console.error('[auth] /userinfo sub mismatch:', data.sub, '!=', expectedSub);
      return undefined;
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
  if (!admins.length) return 'user';
  if (email && admins.includes(email.toLowerCase())) return 'admin';
  if (sub && admins.includes(sub.toLowerCase())) return 'admin';
  return 'user';
}

/**
 * Extract the email from a JWT payload, checking both the standard `email`
 * claim and any namespaced claim ending with `/email`.
 * Falls back to `name` or `nickname` if they look like email addresses
 * (common with Auth0 database connections where username IS the email).
 */
function extractEmail(payload) {
  if (payload.email) return payload.email;
  for (const key of Object.keys(payload)) {
    if (key.endsWith('/email') && payload[key]) {
      return payload[key];
    }
  }
  // Fallback: some Auth0 connections store the email as the name/nickname
  // or in other standard OIDC claims like preferred_username
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (payload.preferred_username && emailRegex.test(payload.preferred_username)) return payload.preferred_username;
  if (payload.name && emailRegex.test(payload.name)) return payload.name;
  if (payload.nickname && emailRegex.test(payload.nickname)) return payload.nickname;
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
    return { user: null, error: 'No Bearer token provided', errorCode: 'no_token' };
  }

  if (!JWKS || !AUTH0_DOMAIN || !AUTH0_CLIENT_ID) {
    console.error('Auth0 not configured — AUTH0_DOMAIN or AUTH0_CLIENT_ID missing');
    return { user: null, error: 'Auth0 not configured on the server', errorCode: 'server_config' };
  }

  const token = authHeader.split(' ')[1];

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://${AUTH0_DOMAIN}/`,
      audience: AUTH0_CLIENT_ID,
      clockTolerance: 60,   // tolerate up to 60 s of clock skew
    });
    let email = extractEmail(payload);

    // If the email is still missing, try the Auth0 /userinfo endpoint as a
    // fallback using the access token the client may have forwarded.
    if (!email) {
      const accessToken =
        event.headers['x-access-token'] || event.headers['X-Access-Token'] || '';
      if (accessToken) {
        email = await fetchEmailFromUserInfo(accessToken, payload.sub);
        if (email) {
          console.log('[auth] Email recovered from /userinfo fallback:', email);
        }
      }
    }

    if (!email) {
      console.error('[auth] JWT verified but NO email found in payload.');
      console.error('[auth] Payload claims:', Object.keys(payload).join(', '));
      console.error('[auth] sub:', payload.sub);
      console.error('[auth] To fix: In Auth0 Dashboard → Actions → Flows → Login,');
      console.error('[auth] add an Action that sets a custom claim with the email.');
    } else {
      console.log('[auth] Email extracted from token:', email);
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
    console.error('Token verification failed:', code, err.message);

    // Try to decode (without verifying) to log which user is affected
    let hint = '';
    try {
      const claims = decodeJwt(token);
      hint = claims.email || extractEmail(claims) || claims.sub || '';
    } catch { /* ignore decode errors */ }
    if (hint) console.error('Token belonged to:', hint);

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
 * Checks the ADMIN_EMAILS env var first (always available) and then falls
 * back to the persisted role in Blobs. This order ensures admins are never
 * locked out by a transient Blobs failure.
 */
export async function verifyAdmin(event) {
  const user = await verifyAuth(event);
  if (!user) return null;

  // 1. Env-based check — fast and always available (checks both email and sub)
  if (getRoleForEmail(user.email, user.sub) === 'admin') {
    return { ...user, role: 'admin' };
  }

  // 2. Persisted role in Blobs (assigned via the admin Users panel)
  try {
    const store = getUserStore();
    const stored = await store.get(user.sub, { type: 'json' });
    if (stored && stored.role === 'admin') {
      return { ...user, role: 'admin' };
    }
  } catch (err) {
    console.error('Blobs read error in verifyAdmin (non-fatal):', err.message);
  }

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
