import { getUserStore, initBlobsContext } from './lib/db.mjs';
import { verifyAuth, respond, getRoleForEmail } from './lib/auth.mjs';

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

    // Determine role: check ADMIN_EMAILS env var, or preserve existing role
    const envRole = getRoleForEmail(user.email);
    const role = envRole === 'admin' ? 'admin' : (existing?.role || 'user');

    if (existing) {
      const updated = {
        ...existing,
        email: user.email,
        name: user.name,
        picture: user.picture,
        role,
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
      role,
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
