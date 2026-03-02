import { getOrdersStore, getShoppingListStore, getAllOrdersStore, getUserStore, initBlobsContext } from './lib/db.mjs';
import { verifyAuth, verifyAdmin, respond } from './lib/auth.mjs';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return respond({}, 204);
  }

  const params = event.queryStringParameters || {};

  // Admin endpoints
  if (params.admin === 'true') {
    const admin = await verifyAdmin(event);
    if (!admin) return respond({ error: 'Admin access required' }, 403);

    try {
      initBlobsContext(event);
      const allOrdersStore = getAllOrdersStore();

      // GET all orders (admin)
      if (event.httpMethod === 'GET') {
        const allOrders = (await allOrdersStore.get('all', { type: 'json' })) || [];
        // Filter by status if requested
        if (params.status) {
          return respond(allOrders.filter(o => o.status === params.status));
        }
        return respond(allOrders);
      }

      // PUT - update order status (admin)
      if (event.httpMethod === 'PUT') {
        const body = JSON.parse(event.body);
        if (!body.orderId || !body.status) {
          return respond({ error: 'orderId and status are required' }, 400);
        }

        const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'completed', 'cancelled', 'refunded'];
        if (!validStatuses.includes(body.status)) {
          return respond({ error: 'Invalid status. Valid statuses: ' + validStatuses.join(', ') }, 400);
        }

        const allOrders = (await allOrdersStore.get('all', { type: 'json' })) || [];
        const orderIdx = allOrders.findIndex(o => o.id === body.orderId || o.orderNumber === body.orderId);
        if (orderIdx === -1) return respond({ error: 'Order not found' }, 404);

        allOrders[orderIdx].status = body.status;
        allOrders[orderIdx].updated_at = new Date().toISOString();
        if (body.trackingNumber) allOrders[orderIdx].trackingNumber = body.trackingNumber;
        if (body.adminNotes) allOrders[orderIdx].adminNotes = body.adminNotes;

        await allOrdersStore.setJSON('all', allOrders);

        // Also update in user's orders
        if (allOrders[orderIdx].userId) {
          const ordersStore = getOrdersStore();
          const userOrders = (await ordersStore.get(allOrders[orderIdx].userId, { type: 'json' })) || [];
          const userOrderIdx = userOrders.findIndex(o => o.id === body.orderId || o.orderNumber === body.orderId);
          if (userOrderIdx > -1) {
            userOrders[userOrderIdx].status = body.status;
            userOrders[userOrderIdx].updated_at = new Date().toISOString();
            if (body.trackingNumber) userOrders[userOrderIdx].trackingNumber = body.trackingNumber;
            await ordersStore.setJSON(allOrders[orderIdx].userId, userOrders);
          }
        }

        return respond({ message: 'Order updated', order: allOrders[orderIdx] });
      }

      return respond({ error: 'Method not allowed' }, 405);
    } catch (err) {
      console.error('Admin orders error:', err);
      return respond({ error: err.message }, 500);
    }
  }

  // User endpoints
  const user = await verifyAuth(event);
  if (!user) return respond({ error: 'Unauthorized' }, 401);

  try {
    initBlobsContext(event);
    const userStore = getUserStore();
    const existingUser = await userStore.get(user.sub, { type: 'json' });
    if (!existingUser) return respond({ error: 'User not found. Call /api/user first.' }, 404);

    const ordersStore = getOrdersStore();
    const orders = (await ordersStore.get(user.sub, { type: 'json' })) || [];

    if (event.httpMethod === 'GET') {
      // Get single order
      if (params.orderId) {
        const order = orders.find(o => o.id === parseInt(params.orderId) || o.orderNumber === params.orderId);
        if (!order) return respond({ error: 'Order not found' }, 404);
        return respond(order);
      }
      return respond(orders);
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');

      // Reorder functionality
      if (body.action === 'reorder' && body.orderId) {
        const originalOrder = orders.find(o => o.id === body.orderId || o.orderNumber === body.orderId);
        if (!originalOrder) return respond({ error: 'Original order not found' }, 404);
        return respond({ items: originalOrder.items, message: 'Add these items to your cart to reorder' });
      }

      // Legacy: place order from shopping list
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
        orderNumber: 'OPF-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substr(2, 4).toUpperCase(),
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

      // Save to global orders store
      const allOrdersStore = getAllOrdersStore();
      const allOrders = (await allOrdersStore.get('all', { type: 'json' })) || [];
      allOrders.unshift({ ...order, userId: user.sub, customerEmail: existingUser.email, customerName: existingUser.name });
      await allOrdersStore.setJSON('all', allOrders);

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
