import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getUserStore } from './db.mjs';

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID;
const JWKS = createRemoteJWKSet(
  new URL(`https://${AUTH0_DOMAIN}/.well-known/jwks.json`)
);

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

export async function verifyAuth(event) {
  const authHeader =
    event.headers.authorization || event.headers.Authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split(' ')[1];

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://${AUTH0_DOMAIN}/`,
      audience: AUTH0_CLIENT_ID,
    });
    // Auth0 typically puts email at payload.email, but some configurations
    // use a namespaced claim (e.g. https://example.com/email). Check both.
    let email = payload.email;
    if (!email) {
      for (const key of Object.keys(payload)) {
        if (key.endsWith('/email') && payload[key]) {
          email = payload[key];
          break;
        }
      }
    }
    return {
      sub: payload.sub,
      email,
      name: payload.name || payload.nickname,
      picture: payload.picture,
    };
  } catch (err) {
    console.error('Token verification failed:', err.message);
    return null;
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
