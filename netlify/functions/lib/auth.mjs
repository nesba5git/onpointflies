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
 * Returns a list of admin email addresses from the ADMIN_EMAILS env var.
 * Format: comma-separated, e.g. "alice@example.com,bob@example.com"
 */
export function getAdminEmails() {
  const raw = process.env.ADMIN_EMAILS || '';
  return raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
}

/**
 * Determine the role for a given email address.
 * If the email is listed in ADMIN_EMAILS, role is 'admin'; otherwise 'user'.
 */
export function getRoleForEmail(email) {
  if (!email) return 'user';
  const admins = getAdminEmails();
  return admins.includes(email.toLowerCase()) ? 'admin' : 'user';
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
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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
    });
    const email = extractEmail(payload);
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

  // 1. Env-based check — fast and always available
  if (getRoleForEmail(user.email) === 'admin') {
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    },
    body: JSON.stringify(data),
  };
}
