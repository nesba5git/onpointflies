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
      const orders = await sql`
        SELECT * FROM orders WHERE user_id = ${userId} ORDER BY created_at DESC
      `;

      const result = [];
      for (const order of orders) {
        const items = await sql`
          SELECT fly_name AS name, fly_type AS type, quantity, price
          FROM order_items WHERE order_id = ${order.id}
        `;
        result.push({ ...order, items });
      }

      return respond(result);
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');

      // Get current shopping list items
      const listItems = await sql`
        SELECT * FROM shopping_list_items WHERE user_id = ${userId}
      `;

      if (listItems.length === 0) {
        return respond({ error: 'Shopping list is empty. Add items before placing an order.' }, 400);
      }

      // Calculate totals
      let totalAmount = 0;
      let totalFlies = 0;
      for (const item of listItems) {
        totalAmount += parseFloat(item.price) * item.quantity;
        totalFlies += item.quantity;
      }

      // Create order
      const order = await sql`
        INSERT INTO orders (user_id, status, total_amount, total_flies, notes)
        VALUES (${userId}, 'pending', ${totalAmount}, ${totalFlies}, ${body.notes || null})
        RETURNING *
      `;

      // Create order items
      for (const item of listItems) {
        await sql`
          INSERT INTO order_items (order_id, fly_name, fly_type, quantity, price)
          VALUES (${order[0].id}, ${item.fly_name}, ${item.fly_type}, ${item.quantity}, ${item.price})
        `;
      }

      // Clear shopping list
      await sql`DELETE FROM shopping_list_items WHERE user_id = ${userId}`;

      // Return complete order
      const items = await sql`
        SELECT fly_name AS name, fly_type AS type, quantity, price
        FROM order_items WHERE order_id = ${order[0].id}
      `;

      return respond({ ...order[0], items });
    }

    return respond({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('Orders error:', err);
    return respond({ error: err.message }, 500);
  }
};
