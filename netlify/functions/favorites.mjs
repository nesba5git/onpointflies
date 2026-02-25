import { getFavoritesStore, getUserStore } from './lib/db.mjs';
import { verifyAuth, respond } from './lib/auth.mjs';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return respond({}, 204);
  }

  const user = await verifyAuth(event);
  if (!user) return respond({ error: 'Unauthorized' }, 401);

  try {
    const userStore = getUserStore();
    const existingUser = await userStore.get(user.sub, { type: 'json' });
    if (!existingUser) return respond({ error: 'User not found. Call /api/user first.' }, 404);

    const store = getFavoritesStore();
    const favorites = (await store.get(user.sub, { type: 'json' })) || [];

    if (event.httpMethod === 'GET') {
      return respond(favorites);
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      const exists = favorites.some((f) => f.name === body.name);
      if (!exists) {
        favorites.push({
          name: body.name,
          type: body.type,
          bestFor: body.bestFor,
          description: body.description,
          image: body.image,
          recipe: body.recipe || null,
          created_at: new Date().toISOString(),
        });
        await store.setJSON(user.sub, favorites);
      }
      return respond({ message: 'Added to favorites' });
    }

    if (event.httpMethod === 'DELETE') {
      const flyName = (event.queryStringParameters || {}).name;
      if (!flyName) return respond({ error: 'Missing fly name parameter' }, 400);
      const updated = favorites.filter((f) => f.name !== flyName);
      await store.setJSON(user.sub, updated);
      return respond({ message: 'Removed from favorites' });
    }

    return respond({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('Favorites error:', err);
    return respond({ error: err.message }, 500);
  }
};
