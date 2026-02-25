import { getShoppingListStore, getUserStore, initBlobs } from './lib/db.mjs';
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

    const store = getShoppingListStore();
    const items = (await store.get(user.sub, { type: 'json' })) || [];

    if (event.httpMethod === 'GET') {
      return respond(items);
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      const existingIndex = items.findIndex((item) => item.name === body.name);

      if (existingIndex > -1) {
        items[existingIndex].quantity += 1;
        items[existingIndex].updated_at = new Date().toISOString();
        await store.setJSON(user.sub, items);
        return respond({ message: 'Quantity updated', quantity: items[existingIndex].quantity });
      }

      items.push({
        name: body.name,
        type: body.type,
        bestFor: body.bestFor,
        description: body.description,
        image: body.image,
        recipe: body.recipe || null,
        quantity: 1,
        price: body.price || 2.50,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      await store.setJSON(user.sub, items);
      return respond({ message: 'Added to shopping list' });
    }

    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body);
      const index = items.findIndex((item) => item.name === body.name);
      if (index > -1) {
        items[index].quantity = body.quantity;
        items[index].updated_at = new Date().toISOString();
        await store.setJSON(user.sub, items);
      }
      return respond({ message: 'Quantity updated' });
    }

    if (event.httpMethod === 'DELETE') {
      const params = event.queryStringParameters || {};

      if (params.all === 'true') {
        await store.setJSON(user.sub, []);
        return respond({ message: 'Shopping list cleared' });
      }

      const flyName = params.name;
      if (!flyName) return respond({ error: 'Missing fly name parameter' }, 400);
      const updated = items.filter((item) => item.name !== flyName);
      await store.setJSON(user.sub, updated);
      return respond({ message: 'Removed from shopping list' });
    }

    return respond({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('Shopping list error:', err);
    return respond({ error: err.message }, 500);
  }
};
