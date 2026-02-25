import { createRemoteJWKSet, jwtVerify } from 'jose';

const AUTH0_DOMAIN = 'dev-ofdinri72f360yav.us.auth0.com';
const AUTH0_CLIENT_ID = 'cFJGoFKtK0pgeR16J2fmX4saKHy8I86V';
const JWKS = createRemoteJWKSet(
  new URL(`https://${AUTH0_DOMAIN}/.well-known/jwks.json`)
);

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
    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    };
  } catch (err) {
    console.error('Token verification failed:', err.message);
    return null;
  }
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

export async function getUserId(sql, auth0Id) {
  const rows = await sql`SELECT id FROM users WHERE auth0_id = ${auth0Id}`;
  return rows.length > 0 ? rows[0].id : null;
}
