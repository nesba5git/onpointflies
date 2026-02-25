import { respond } from './lib/auth.mjs';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return respond({}, 204);
  }

  if (event.httpMethod !== 'POST') {
    return respond({ error: 'Method not allowed. Send a POST request.' }, 405);
  }

  // Netlify Blobs requires no setup — stores are created on first write
  return respond({ message: 'Storage is ready. Netlify Blobs requires no setup.' });
};
