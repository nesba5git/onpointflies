import { respond } from './lib/auth.mjs';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return respond({}, 204);
  }

  const domain = (process.env.AUTH0_DOMAIN || '').trim();
  const clientId = (process.env.AUTH0_CLIENT_ID || '').trim();

  console.log('[auth-config] Returning config: domain=' + (domain ? 'set' : 'MISSING') + ', clientId=' + (clientId ? 'set' : 'MISSING'));

  if (!domain || !clientId) {
    console.error('[auth-config] CRITICAL: Auth0 env vars not configured!');
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Access-Token',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
    body: JSON.stringify({
      domain,
      clientId,
    }),
  };
};
