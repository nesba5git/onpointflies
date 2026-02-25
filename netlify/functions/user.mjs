import { initDb } from './lib/db.mjs';
import { verifyAuth, respond } from './lib/auth.mjs';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return respond({}, 204);
  }

  const user = await verifyAuth(event);
  if (!user) return respond({ error: 'Unauthorized' }, 401);

  try {
    const sql = await initDb();

    // Get or create user
    const existing = await sql`SELECT * FROM users WHERE auth0_id = ${user.sub}`;

    if (existing.length > 0) {
      await sql`
        UPDATE users
        SET email = ${user.email}, name = ${user.name}, picture = ${user.picture}, updated_at = NOW()
        WHERE auth0_id = ${user.sub}
      `;
      return respond(existing[0]);
    }

    const newUser = await sql`
      INSERT INTO users (auth0_id, email, name, picture)
      VALUES (${user.sub}, ${user.email}, ${user.name}, ${user.picture})
      RETURNING *
    `;
    return respond(newUser[0]);
  } catch (err) {
    console.error('User error:', err);
    return respond({ error: err.message }, 500);
  }
};
