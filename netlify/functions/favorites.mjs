import { initDb } from './lib/db.mjs';
import { verifyAuth, respond, getUserId } from './lib/auth.mjs';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return respond({}, 204);
  }

  const user = await verifyAuth(event);
  if (!user) return respond({ error: 'Unauthorized' }, 401);

  try {
    const sql = await initDb();
    const userId = await getUserId(sql, user.sub);
    if (!userId) return respond({ error: 'User not found. Call /api/user first.' }, 404);

    if (event.httpMethod === 'GET') {
      const favorites = await sql`
        SELECT fly_name AS name, fly_type AS type, fly_best_for AS "bestFor",
               fly_description AS description, fly_image AS image, fly_recipe AS recipe,
               created_at
        FROM favorites WHERE user_id = ${userId} ORDER BY created_at DESC
      `;
      return respond(favorites);
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      await sql`
        INSERT INTO favorites (user_id, fly_name, fly_type, fly_best_for, fly_description, fly_image, fly_recipe)
        VALUES (${userId}, ${body.name}, ${body.type}, ${body.bestFor}, ${body.description}, ${body.image}, ${body.recipe || null})
        ON CONFLICT (user_id, fly_name) DO NOTHING
      `;
      return respond({ message: 'Added to favorites' });
    }

    if (event.httpMethod === 'DELETE') {
      const flyName = (event.queryStringParameters || {}).name;
      if (!flyName) return respond({ error: 'Missing fly name parameter' }, 400);
      await sql`DELETE FROM favorites WHERE user_id = ${userId} AND fly_name = ${flyName}`;
      return respond({ message: 'Removed from favorites' });
    }

    return respond({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('Favorites error:', err);
    return respond({ error: err.message }, 500);
  }
};
