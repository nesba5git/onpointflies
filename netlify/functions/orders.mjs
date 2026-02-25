import { getOrdersStore, getShoppingListStore, getUserStore, initBlobs } from './lib/db.mjs';
import { verifyAuth, respond } from './lib/auth.mjs';

export const handler = async (event) => {
  initBlobs(event);

  if (event.httpMethod === 'OPTIONS') {
    return respond({}, 204);
  }

  const user = await verifyAuth(event);
  if (!user) return respond({ error: 'Unauthorized' }, 401);

  try {
    const userStore = getUserStore();
    const existingUser = await userStore.get(user.sub, { type: 'json' });
    if (!existingUser) return respond({ error: 'User not found. Call /api/user first.' }, 404);

    const ordersStore = getOrdersStore();
    const orders = (await ordersStore.get(user.sub, { type: 'json' })) || [];

    if (event.httpMethod === 'GET') {
      return respond(orders);
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');

      const listStore = getShoppingListStore();
      const listItems = (await listStore.get(user.sub, { type: 'json' })) || [];

      if (listItems.length === 0) {
        return respond({ error: 'Shopping list is empty. Add items before placing an order.' }, 400);
      }

      let totalAmount = 0;
      let totalFlies = 0;
      const orderItems = [];

      for (const item of listItems) {
        const price = parseFloat(item.price) || 2.50;
        totalAmount += price * item.quantity;
        totalFlies += item.quantity;
        orderItems.push({
          name: item.name,
          type: item.type,
          quantity: item.quantity,
          price: price,
        });
      }

      const order = {
        id: Date.now(),
        status: 'pending',
        total_amount: totalAmount,
        total_flies: totalFlies,
        notes: body.notes || null,
        items: orderItems,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      orders.unshift(order);
      await ordersStore.setJSON(user.sub, orders);

      // Clear shopping list
      await listStore.setJSON(user.sub, []);

      return respond(order);
    }

    return respond({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('Orders error:', err);
    return respond({ error: err.message }, 500);
  }
};
