import { initDb } from './lib/db.mjs';
import { respond } from './lib/auth.mjs';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return respond({}, 204);
  }

  if (event.httpMethod !== 'POST') {
    return respond({ error: 'Method not allowed. Send a POST request.' }, 405);
  }

  try {
    const sql = await initDb();
    return respond({ message: 'Database tables created successfully' });
  } catch (err) {
    console.error('DB setup error:', err);
    return respond({ error: err.message }, 500);
  }
};
