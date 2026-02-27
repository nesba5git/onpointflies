import { getUserStore, initBlobsContext } from './lib/db.mjs';
import { verifyAdmin, respond } from './lib/auth.mjs';

/**
 * Admin-only endpoint for managing user roles.
 *
 * GET  /api/roles          — list all users with their roles
 * PUT  /api/roles          — update a user's role  { auth0_id, role }
 */
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return respond({}, 204);
  }

  try {
    initBlobsContext(event);

    // All operations require admin role
    const admin = await verifyAdmin(event);
    if (!admin) return respond({ error: 'Unauthorized — admin access required' }, 403);

    const store = getUserStore();

    if (event.httpMethod === 'GET') {
      // List all known users — iterate through the store
      const { blobs } = await store.list();
      const users = [];
      for (const entry of blobs) {
        const userData = await store.get(entry.key, { type: 'json' });
        if (userData) {
          users.push({
            auth0_id: userData.auth0_id,
            email: userData.email,
            name: userData.name,
            picture: userData.picture,
            role: userData.role || 'user',
            created_at: userData.created_at,
          });
        }
      }
      return respond(users);
    }

    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body);
      if (!body.auth0_id || !body.role) {
        return respond({ error: 'auth0_id and role are required' }, 400);
      }
      if (!['admin', 'user'].includes(body.role)) {
        return respond({ error: 'Role must be "admin" or "user"' }, 400);
      }

      const existing = await store.get(body.auth0_id, { type: 'json' });
      if (!existing) {
        return respond({ error: 'User not found' }, 404);
      }

      const updated = {
        ...existing,
        role: body.role,
        updated_at: new Date().toISOString(),
      };
      await store.setJSON(body.auth0_id, updated);

      return respond({ message: 'Role updated', user: { auth0_id: updated.auth0_id, email: updated.email, name: updated.name, role: updated.role } });
    }

    return respond({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('Roles error:', err);
    return respond({ error: err.message }, 500);
  }
};
