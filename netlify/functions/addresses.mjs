import { getAddressBookStore, getUserStore, initBlobsContext } from './lib/db.mjs';
import { verifyAuth, respond } from './lib/auth.mjs';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return respond({}, 204);
  }

  const user = await verifyAuth(event);
  if (!user) return respond({ error: 'Unauthorized' }, 401);

  try {
    initBlobsContext(event);
    const userStore = getUserStore();
    const existingUser = await userStore.get(user.sub, { type: 'json' });
    if (!existingUser) return respond({ error: 'User not found.' }, 404);

    const store = getAddressBookStore();
    const addresses = (await store.get(user.sub, { type: 'json' })) || [];

    // GET - return address book
    if (event.httpMethod === 'GET') {
      return respond(addresses);
    }

    // POST - add address
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      if (!body.street || !body.city || !body.state || !body.zip) {
        return respond({ error: 'Street, city, state, and zip are required' }, 400);
      }

      const address = {
        id: Date.now(),
        label: body.label || 'Home',
        firstName: body.firstName || '',
        lastName: body.lastName || '',
        street: body.street,
        street2: body.street2 || body.apt || '',
        city: body.city,
        state: body.state,
        zip: body.zip,
        country: body.country || 'US',
        phone: body.phone || '',
        isDefault: addresses.length === 0 || body.isDefault === true,
        created_at: new Date().toISOString()
      };

      if (address.isDefault) {
        addresses.forEach(a => a.isDefault = false);
      }

      addresses.push(address);
      await store.setJSON(user.sub, addresses);
      return respond({ message: 'Address added', address });
    }

    // PUT - update address
    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body);
      const idx = addresses.findIndex(a => a.id === body.id);
      if (idx === -1) return respond({ error: 'Address not found' }, 404);

      if (body.isDefault) {
        addresses.forEach(a => a.isDefault = false);
      }

      addresses[idx] = { ...addresses[idx], ...body, updated_at: new Date().toISOString() };
      await store.setJSON(user.sub, addresses);
      return respond({ message: 'Address updated' });
    }

    // DELETE - remove address
    if (event.httpMethod === 'DELETE') {
      const params = event.queryStringParameters || {};
      if (!params.id) return respond({ error: 'Address ID required' }, 400);

      const filtered = addresses.filter(a => a.id !== parseInt(params.id));
      await store.setJSON(user.sub, filtered);
      return respond({ message: 'Address removed' });
    }

    return respond({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('Address error:', err);
    return respond({ error: err.message }, 500);
  }
};
