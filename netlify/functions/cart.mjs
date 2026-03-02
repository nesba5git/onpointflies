import { getCartStore, getSaveForLaterStore, getInventoryStore, getUserStore, initBlobsContext } from './lib/db.mjs';
import { verifyAuth, respond } from './lib/auth.mjs';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return respond({}, 204);
  }

  // Allow guest cart via localStorage on frontend; this endpoint requires auth
  const user = await verifyAuth(event);
  if (!user) return respond({ error: 'Unauthorized' }, 401);

  try {
    initBlobsContext(event);
    const userStore = getUserStore();
    const existingUser = await userStore.get(user.sub, { type: 'json' });
    if (!existingUser) return respond({ error: 'User not found. Call /api/user first.' }, 404);

    const cartStore = getCartStore();
    const cart = (await cartStore.get(user.sub, { type: 'json' })) || {
      items: [],
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };

    const params = event.queryStringParameters || {};

    // GET - return cart with validation
    if (event.httpMethod === 'GET') {
      // Validate inventory availability
      if (params.validate === 'true') {
        const invStore = getInventoryStore();
        const inventory = (await invStore.get('all', { type: 'json' })) || [];
        const notifications = [];

        for (const item of cart.items) {
          const invItem = inventory.find(i => i.id === item.inventoryId || i.name === item.name);
          if (invItem) {
            if (invItem.qty === 0) {
              notifications.push({
                itemName: item.name,
                type: 'out_of_stock',
                message: `${item.name} is currently out of stock`,
                available: 0
              });
            } else if (invItem.qty < item.quantity) {
              notifications.push({
                itemName: item.name,
                type: 'low_stock',
                message: `Only ${invItem.qty} available (you have ${item.quantity})`,
                available: invItem.qty
              });
            }
          }
        }

        // Include saved-for-later items
        const saveStore = getSaveForLaterStore();
        const savedItems = (await saveStore.get(user.sub, { type: 'json' })) || [];

        return respond({ ...cart, savedItems, notifications });
      }

      // Include save-for-later count
      const saveStore = getSaveForLaterStore();
      const saved = (await saveStore.get(user.sub, { type: 'json' })) || [];

      return respond({
        ...cart,
        savedForLaterCount: saved.length,
        itemCount: cart.items.reduce((sum, i) => sum + i.quantity, 0),
        subtotal: cart.items.reduce((sum, i) => sum + (i.price * i.quantity), 0)
      });
    }

    // POST - add item to cart
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      const action = body.action || 'add';

      if (action === 'add') {
        // Check for existing item with same name and variant
        const variantKey = body.variant || 'default';
        const sizeKey = body.size || 'default';
        const existIdx = cart.items.findIndex(
          i => i.name === body.name && (i.variant || 'default') === variantKey && (i.size || 'default') === sizeKey
        );

        if (existIdx > -1) {
          const newQty = cart.items[existIdx].quantity + (body.quantity || 1);
          // Enforce max quantity
          const maxQty = body.maxQuantity || 99;
          if (newQty > maxQty) {
            return respond({ error: `Maximum quantity of ${maxQty} reached for ${body.name}` }, 400);
          }
          cart.items[existIdx].quantity = newQty;
          cart.items[existIdx].updated_at = new Date().toISOString();
        } else {
          const minQty = body.minQuantity || 1;
          cart.items.push({
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            name: body.name,
            type: body.type,
            bestFor: body.bestFor,
            description: body.description,
            image: body.image,
            recipe: body.recipe || null,
            price: parseFloat(body.price) || 2.50,
            quantity: Math.max(minQty, body.quantity || 1),
            variant: body.variant || null,
            size: body.size || null,
            inventoryId: body.inventoryId || null,
            isDigital: body.isDigital || false,
            isPreorder: body.isPreorder || false,
            minQuantity: minQty,
            maxQuantity: body.maxQuantity || 99,
            added_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }

        cart.updated_at = new Date().toISOString();
        cart.expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await cartStore.setJSON(user.sub, cart);

        return respond({
          message: existIdx > -1 ? 'Quantity updated' : 'Added to cart',
          itemCount: cart.items.reduce((sum, i) => sum + i.quantity, 0),
          subtotal: cart.items.reduce((sum, i) => sum + (i.price * i.quantity), 0)
        });
      }

      // Move item to save-for-later
      if (action === 'save-for-later') {
        const itemIdx = cart.items.findIndex(i => i.id === body.itemId);
        if (itemIdx === -1) return respond({ error: 'Item not found in cart' }, 404);

        const savedItem = { ...cart.items[itemIdx], saved_at: new Date().toISOString() };
        cart.items.splice(itemIdx, 1);

        const saveStore = getSaveForLaterStore();
        const saved = (await saveStore.get(user.sub, { type: 'json' })) || [];
        saved.push(savedItem);
        await saveStore.setJSON(user.sub, saved);

        cart.updated_at = new Date().toISOString();
        await cartStore.setJSON(user.sub, cart);

        return respond({ message: 'Moved to save for later' });
      }

      // Move item from save-for-later back to cart
      if (action === 'move-to-cart') {
        const saveStore = getSaveForLaterStore();
        const saved = (await saveStore.get(user.sub, { type: 'json' })) || [];
        const savedIdx = saved.findIndex(i => i.id === body.itemId);
        if (savedIdx === -1) return respond({ error: 'Item not found in saved list' }, 404);

        const item = saved[savedIdx];
        delete item.saved_at;
        item.updated_at = new Date().toISOString();
        cart.items.push(item);
        saved.splice(savedIdx, 1);

        await saveStore.setJSON(user.sub, saved);
        cart.updated_at = new Date().toISOString();
        await cartStore.setJSON(user.sub, cart);

        return respond({ message: 'Moved to cart' });
      }

      // Merge guest cart into user cart
      if (action === 'merge') {
        const guestItems = body.items || [];
        for (const guestItem of guestItems) {
          const existIdx = cart.items.findIndex(i => i.name === guestItem.name);
          if (existIdx > -1) {
            cart.items[existIdx].quantity += guestItem.quantity || 1;
          } else {
            cart.items.push({
              ...guestItem,
              id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
              added_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
          }
        }
        cart.updated_at = new Date().toISOString();
        await cartStore.setJSON(user.sub, cart);
        return respond({ message: 'Cart merged', itemCount: cart.items.reduce((sum, i) => sum + i.quantity, 0) });
      }

      return respond({ error: 'Unknown action' }, 400);
    }

    // PUT - update item quantity or properties
    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body);
      const itemIdx = cart.items.findIndex(i => i.id === body.itemId);
      if (itemIdx === -1) return respond({ error: 'Item not found in cart' }, 404);

      if (body.quantity !== undefined) {
        const minQty = cart.items[itemIdx].minQuantity || 1;
        const maxQty = cart.items[itemIdx].maxQuantity || 99;
        const newQty = Math.max(minQty, Math.min(maxQty, body.quantity));
        cart.items[itemIdx].quantity = newQty;
      }
      if (body.variant !== undefined) cart.items[itemIdx].variant = body.variant;
      if (body.size !== undefined) cart.items[itemIdx].size = body.size;
      if (body.giftMessage !== undefined) cart.items[itemIdx].giftMessage = body.giftMessage;

      cart.items[itemIdx].updated_at = new Date().toISOString();
      cart.updated_at = new Date().toISOString();
      await cartStore.setJSON(user.sub, cart);

      return respond({
        message: 'Cart updated',
        itemCount: cart.items.reduce((sum, i) => sum + i.quantity, 0),
        subtotal: cart.items.reduce((sum, i) => sum + (i.price * i.quantity), 0)
      });
    }

    // DELETE - remove item or clear cart
    if (event.httpMethod === 'DELETE') {
      if (params.all === 'true') {
        cart.items = [];
        cart.updated_at = new Date().toISOString();
        await cartStore.setJSON(user.sub, cart);
        return respond({ message: 'Cart cleared' });
      }

      if (params.savedAll === 'true') {
        const saveStore = getSaveForLaterStore();
        await saveStore.setJSON(user.sub, []);
        return respond({ message: 'Saved items cleared' });
      }

      const itemId = params.itemId;
      if (!itemId) return respond({ error: 'Missing itemId' }, 400);

      // Check if removing from saved
      if (params.from === 'saved') {
        const saveStore = getSaveForLaterStore();
        const saved = (await saveStore.get(user.sub, { type: 'json' })) || [];
        const filtered = saved.filter(i => i.id !== itemId);
        await saveStore.setJSON(user.sub, filtered);
        return respond({ message: 'Removed from saved items' });
      }

      cart.items = cart.items.filter(i => i.id !== itemId);
      cart.updated_at = new Date().toISOString();
      await cartStore.setJSON(user.sub, cart);

      return respond({
        message: 'Item removed',
        itemCount: cart.items.reduce((sum, i) => sum + i.quantity, 0),
        subtotal: cart.items.reduce((sum, i) => sum + (i.price * i.quantity), 0)
      });
    }

    return respond({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('Cart error:', err);
    return respond({ error: err.message }, 500);
  }
};
