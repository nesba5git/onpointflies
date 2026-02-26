import { getInventoryStore, initBlobsContext } from './lib/db.mjs';
import { verifyAuth, respond } from './lib/auth.mjs';

const STORE_KEY = 'all';

// Default inventory data — seeded on first access from the original hardcoded HTML tables
const DEFAULT_INVENTORY = [
  // Woolly Buggers
  { id: 1, name: "CH Black Bugger", category: "streamers", subcategory: "Woolly Buggers", size: "4", qty: 10, price: 2.99, sold: 0, startingQty: 10 },
  { id: 2, name: "CH RubberLegs Black Bugger", category: "streamers", subcategory: "Woolly Buggers", size: "12", qty: 9, price: 2.50, sold: 0, startingQty: 9 },
  { id: 3, name: "BH Purple Bugger", category: "streamers", subcategory: "Woolly Buggers", size: "8", qty: 6, price: 2.25, sold: 0, startingQty: 6 },
  { id: 4, name: "BH Purple Bugger", category: "streamers", subcategory: "Woolly Buggers", size: "10", qty: 8, price: 2.25, sold: 4, startingQty: 12 },
  { id: 5, name: "BH Black Bugger", category: "streamers", subcategory: "Woolly Buggers", size: "8", qty: 6, price: 2.25, sold: 0, startingQty: 6 },
  { id: 6, name: "BH Black Bugger", category: "streamers", subcategory: "Woolly Buggers", size: "12", qty: 12, price: 2.25, sold: 0, startingQty: 12 },
  { id: 7, name: "BH Chartreuse Bugger", category: "streamers", subcategory: "Woolly Buggers", size: "10", qty: 9, price: 2.25, sold: 0, startingQty: 9 },
  { id: 8, name: "Wooly Bugger Black Hackled Head", category: "streamers", subcategory: "Woolly Buggers", size: "12", qty: 24, price: 1.99, sold: 6, startingQty: 30 },
  // Hellgrammite
  { id: 9, name: "Woolly Hellgrammite WTD (K)", category: "streamers", subcategory: "Hellgrammite", size: "8", qty: 18, price: 1.50, sold: 6, startingQty: 24 },
  { id: 10, name: "Hellgrammite WTD", category: "streamers", subcategory: "Hellgrammite", size: "8", qty: 29, price: 1.50, sold: 6, startingQty: 35 },
  // Muddler Minnows
  { id: 11, name: "Muddler Marabou-Olive", category: "streamers", subcategory: "Muddler Minnows", size: "12", qty: 3, price: 2.25, sold: 0, startingQty: 3 },
  { id: 12, name: "Muddler Marabou-Olive", category: "streamers", subcategory: "Muddler Minnows", size: "10", qty: 12, price: 2.25, sold: 0, startingQty: 12 },
  { id: 13, name: "Muddler Minnow", category: "streamers", subcategory: "Muddler Minnows", size: "8", qty: 9, price: 2.75, sold: 0, startingQty: 9 },
  { id: 14, name: "Muddler Minnow", category: "streamers", subcategory: "Muddler Minnows", size: "6", qty: 12, price: 2.75, sold: 0, startingQty: 12 },
  { id: 15, name: "Muddler Minnow", category: "streamers", subcategory: "Muddler Minnows", size: "2", qty: 12, price: 3.50, sold: 0, startingQty: 12 },
  { id: 16, name: "Muddler Minnow", category: "streamers", subcategory: "Muddler Minnows", size: "10", qty: 12, price: 2.75, sold: 0, startingQty: 12 },
  { id: 17, name: "Muddler Minnow", category: "streamers", subcategory: "Muddler Minnows", size: "16", qty: 12, price: 2.50, sold: 0, startingQty: 12 },
  { id: 18, name: "Muddler Minnow", category: "streamers", subcategory: "Muddler Minnows", size: "14", qty: 24, price: 2.50, sold: 0, startingQty: 24 },
  { id: 19, name: "Muddler Minnow", category: "streamers", subcategory: "Muddler Minnows", size: "12", qty: 8, price: 2.50, sold: 4, startingQty: 12 },
  // Zonkers
  { id: 20, name: "Zonker Pearl/Tan", category: "streamers", subcategory: "Zonkers", size: "2", qty: 6, price: 4.50, sold: 0, startingQty: 6 },
  { id: 21, name: "Zonker Pearl/Tan", category: "streamers", subcategory: "Zonkers", size: "6", qty: 5, price: 3.50, sold: 0, startingQty: 5 },
  // Misc Streamers
  { id: 22, name: "Mickey Finn", category: "streamers", subcategory: "Misc. Streamers", size: "8", qty: 6, price: 1.25, sold: 0, startingQty: 6 },
  { id: 23, name: "Matuka-Olive", category: "streamers", subcategory: "Misc. Streamers", size: "10", qty: 3, price: 1.00, sold: 6, startingQty: 9 },
  { id: 24, name: "Mickey Finn", category: "streamers", subcategory: "Misc. Streamers", size: "10", qty: 2, price: 1.25, sold: 4, startingQty: 6 },
  { id: 25, name: "Black Ghost - Feather Wing", category: "streamers", subcategory: "Misc. Streamers", size: "12", qty: 18, price: 1.75, sold: 0, startingQty: 18 },
  { id: 26, name: "Little Brown Trout", category: "streamers", subcategory: "Misc. Streamers", size: "12", qty: 15, price: 1.00, sold: 0, startingQty: 15 },
  { id: 27, name: "Little Brown Trout", category: "streamers", subcategory: "Misc. Streamers", size: "10", qty: 8, price: 1.00, sold: 0, startingQty: 8 },
  { id: 28, name: "Little Brooke Trout", category: "streamers", subcategory: "Misc. Streamers", size: "10", qty: 23, price: 1.00, sold: 0, startingQty: 23 },
  { id: 29, name: "Little Brooke Trout", category: "streamers", subcategory: "Misc. Streamers", size: "12", qty: 4, price: 1.00, sold: 4, startingQty: 8 },
];

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return respond({}, 204);
  }

  try {
    initBlobsContext(event);
    const store = getInventoryStore();

    // GET — public, no auth required
    if (event.httpMethod === 'GET') {
      let inventory = await store.get(STORE_KEY, { type: 'json' });
      if (!inventory) {
        // Seed with default data on first access
        inventory = DEFAULT_INVENTORY;
        await store.setJSON(STORE_KEY, inventory);
      }
      return respond(inventory);
    }

    // All write operations require authentication
    const user = await verifyAuth(event);
    if (!user) return respond({ error: 'Unauthorized' }, 401);

    let inventory = (await store.get(STORE_KEY, { type: 'json' })) || [];

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      if (!body.name || !body.category) {
        return respond({ error: 'Name and category are required' }, 400);
      }
      const newId = inventory.length > 0 ? Math.max(...inventory.map(i => i.id)) + 1 : 1;
      inventory.push({
        id: newId,
        name: body.name,
        category: body.category,
        subcategory: body.subcategory || '',
        size: body.size || '',
        qty: parseInt(body.qty) || 0,
        price: parseFloat(body.price) || 0,
        sold: parseInt(body.sold) || 0,
        startingQty: parseInt(body.startingQty) || parseInt(body.qty) || 0,
        image: body.image || '',
      });
      await store.setJSON(STORE_KEY, inventory);
      return respond({ message: 'Inventory item added', inventory });
    }

    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body);
      if (!body.id) {
        return respond({ error: 'Item id is required to update' }, 400);
      }
      const index = inventory.findIndex(i => i.id === body.id);
      if (index === -1) {
        return respond({ error: 'Inventory item not found' }, 404);
      }
      inventory[index] = {
        id: body.id,
        name: body.name !== undefined ? body.name : inventory[index].name,
        category: body.category !== undefined ? body.category : inventory[index].category,
        subcategory: body.subcategory !== undefined ? body.subcategory : inventory[index].subcategory,
        size: body.size !== undefined ? body.size : inventory[index].size,
        qty: body.qty !== undefined ? parseInt(body.qty) : inventory[index].qty,
        price: body.price !== undefined ? parseFloat(body.price) : inventory[index].price,
        sold: body.sold !== undefined ? parseInt(body.sold) : inventory[index].sold,
        startingQty: body.startingQty !== undefined ? parseInt(body.startingQty) : inventory[index].startingQty,
        image: body.image !== undefined ? body.image : (inventory[index].image || ''),
      };
      await store.setJSON(STORE_KEY, inventory);
      return respond({ message: 'Inventory item updated', inventory });
    }

    if (event.httpMethod === 'DELETE') {
      const params = event.queryStringParameters || {};
      const id = params.id ? parseInt(params.id) : null;
      if (!id) {
        return respond({ error: 'Item id is required' }, 400);
      }
      const index = inventory.findIndex(i => i.id === id);
      if (index === -1) {
        return respond({ error: 'Inventory item not found' }, 404);
      }
      inventory.splice(index, 1);
      await store.setJSON(STORE_KEY, inventory);
      return respond({ message: 'Inventory item deleted', inventory });
    }

    return respond({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('Inventory error:', err);
    return respond({ error: err.message }, 500);
  }
};
