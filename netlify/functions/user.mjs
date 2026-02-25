import { getUserStore, initBlobsContext } from './lib/db.mjs';
import { verifyAuth, respond } from './lib/auth.mjs';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return respond({}, 204);
  }

  const user = await verifyAuth(event);
  if (!user) return respond({ error: 'Unauthorized' }, 401);

  try {
    initBlobsContext(event);
    const store = getUserStore();
    const existing = await store.get(user.sub, { type: 'json' });

    if (existing) {
      const updated = {
        ...existing,
        email: user.email,
        name: user.name,
        picture: user.picture,
        updated_at: new Date().toISOString(),
      };
      await store.setJSON(user.sub, updated);
      return respond(updated);
    }

    const newUser = {
      auth0_id: user.sub,
      email: user.email,
      name: user.name,
      picture: user.picture,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await store.setJSON(user.sub, newUser);
    return respond(newUser);
  } catch (err) {
    console.error('User error:', err);
    return respond({ error: err.message }, 500);
  }
};
