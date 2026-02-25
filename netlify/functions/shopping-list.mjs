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
      const items = await sql`
        SELECT fly_name AS name, fly_type AS type, fly_best_for AS "bestFor",
               fly_description AS description, fly_image AS image, fly_recipe AS recipe,
               quantity, price
        FROM shopping_list_items WHERE user_id = ${userId} ORDER BY created_at DESC
      `;
      return respond(items);
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      const existing = await sql`
        SELECT id, quantity FROM shopping_list_items
        WHERE user_id = ${userId} AND fly_name = ${body.name}
      `;

      if (existing.length > 0) {
        const newQty = existing[0].quantity + 1;
        await sql`
          UPDATE shopping_list_items SET quantity = ${newQty}, updated_at = NOW()
          WHERE id = ${existing[0].id}
        `;
        return respond({ message: 'Quantity updated', quantity: newQty });
      }

      await sql`
        INSERT INTO shopping_list_items
          (user_id, fly_name, fly_type, fly_best_for, fly_description, fly_image, fly_recipe, quantity, price)
        VALUES
          (${userId}, ${body.name}, ${body.type}, ${body.bestFor}, ${body.description}, ${body.image}, ${body.recipe || null}, 1, ${body.price || 2.50})
      `;
      return respond({ message: 'Added to shopping list' });
    }

    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body);
      await sql`
        UPDATE shopping_list_items SET quantity = ${body.quantity}, updated_at = NOW()
        WHERE user_id = ${userId} AND fly_name = ${body.name}
      `;
      return respond({ message: 'Quantity updated' });
    }

    if (event.httpMethod === 'DELETE') {
      const params = event.queryStringParameters || {};

      if (params.all === 'true') {
        await sql`DELETE FROM shopping_list_items WHERE user_id = ${userId}`;
        return respond({ message: 'Shopping list cleared' });
      }

      const flyName = params.name;
      if (!flyName) return respond({ error: 'Missing fly name parameter' }, 400);
      await sql`DELETE FROM shopping_list_items WHERE user_id = ${userId} AND fly_name = ${flyName}`;
      return respond({ message: 'Removed from shopping list' });
    }

    return respond({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('Shopping list error:', err);
    return respond({ error: err.message }, 500);
  }
};
