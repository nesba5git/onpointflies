import { getCartStore, getOrdersStore, getAllOrdersStore, getInventoryStore, getUserStore, getAddressBookStore, getCouponsStore, initBlobsContext } from './lib/db.mjs';
import { verifyAuth, respond } from './lib/auth.mjs';

// Tax rates by state (simplified US sales tax)
const STATE_TAX_RATES = {
  AL: 0.04, AZ: 0.056, AR: 0.065, CA: 0.0725, CO: 0.029,
  CT: 0.0635, DC: 0.06, FL: 0.06, GA: 0.04, HI: 0.04,
  ID: 0.06, IL: 0.0625, IN: 0.07, IA: 0.06, KS: 0.065,
  KY: 0.06, LA: 0.0445, ME: 0.055, MD: 0.06, MA: 0.0625,
  MI: 0.06, MN: 0.06875, MS: 0.07, MO: 0.04225, NE: 0.055,
  NV: 0.0685, NJ: 0.06625, NM: 0.05125, NY: 0.04, NC: 0.0475,
  ND: 0.05, OH: 0.0575, OK: 0.045, PA: 0.06, RI: 0.07,
  SC: 0.06, SD: 0.045, TN: 0.07, TX: 0.0625, UT: 0.0610,
  VT: 0.06, VA: 0.053, WA: 0.065, WV: 0.06, WI: 0.05, WY: 0.04
};
// States with no sales tax
const NO_TAX_STATES = ['AK', 'DE', 'MT', 'NH', 'OR'];

// Shipping rates
const SHIPPING_METHODS = [
  { id: 'standard', name: 'Standard Shipping', description: '5-7 business days', baseRate: 4.99, perItemRate: 0.50, freeThreshold: 50 },
  { id: 'priority', name: 'Priority Shipping', description: '2-3 business days', baseRate: 9.99, perItemRate: 0.75, freeThreshold: null },
  { id: 'express', name: 'Express Shipping', description: '1-2 business days', baseRate: 14.99, perItemRate: 1.00, freeThreshold: null },
  { id: 'pickup', name: 'In-Store Pickup', description: 'Ready within 24 hours', baseRate: 0, perItemRate: 0, freeThreshold: null }
];

function generateOrderNumber() {
  const prefix = 'OPF';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substr(2, 4).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

function calculateTax(subtotal, state) {
  if (!state || NO_TAX_STATES.includes(state.toUpperCase())) return 0;
  const rate = STATE_TAX_RATES[state.toUpperCase()] || 0;
  return Math.round(subtotal * rate * 100) / 100;
}

function calculateShipping(method, itemCount, subtotal) {
  const shipping = SHIPPING_METHODS.find(m => m.id === method) || SHIPPING_METHODS[0];
  if (shipping.freeThreshold && subtotal >= shipping.freeThreshold) return 0;
  return Math.round((shipping.baseRate + (shipping.perItemRate * Math.max(0, itemCount - 1))) * 100) / 100;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return respond({}, 204);
  }

  const params = event.queryStringParameters || {};

  // Public endpoint for shipping methods
  if (event.httpMethod === 'GET' && params.info === 'shipping') {
    return respond({ methods: SHIPPING_METHODS });
  }

  // Public endpoint for tax rate lookup
  if (event.httpMethod === 'GET' && params.info === 'tax') {
    const state = params.state || '';
    const noTax = NO_TAX_STATES.includes(state.toUpperCase());
    const rate = noTax ? 0 : (STATE_TAX_RATES[state.toUpperCase()] || 0);
    return respond({ state, rate, noTax });
  }

  const user = await verifyAuth(event);
  if (!user) return respond({ error: 'Unauthorized' }, 401);

  try {
    initBlobsContext(event);
    const userStore = getUserStore();
    const existingUser = await userStore.get(user.sub, { type: 'json' });
    if (!existingUser) return respond({ error: 'User not found.' }, 404);

    // GET - calculate order totals preview
    if (event.httpMethod === 'GET') {
      const cartStore = getCartStore();
      const cart = (await cartStore.get(user.sub, { type: 'json' })) || { items: [] };

      if (cart.items.length === 0) {
        return respond({ error: 'Cart is empty' }, 400);
      }

      const subtotal = cart.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
      const itemCount = cart.items.reduce((sum, i) => sum + i.quantity, 0);
      const state = params.state || '';
      const shippingMethod = params.shipping || 'standard';

      // Apply coupon if provided
      let discount = 0;
      let couponInfo = null;
      if (params.coupon) {
        const couponsStore = getCouponsStore();
        const coupons = (await couponsStore.get('active', { type: 'json' })) || [];
        const coupon = coupons.find(c => c.code.toLowerCase() === params.coupon.toLowerCase() && c.active);
        if (coupon) {
          if (coupon.type === 'percentage') {
            discount = Math.round(subtotal * (coupon.value / 100) * 100) / 100;
          } else if (coupon.type === 'fixed') {
            discount = Math.min(coupon.value, subtotal);
          }
          if (coupon.minOrder && subtotal < coupon.minOrder) {
            discount = 0;
            couponInfo = { valid: false, message: `Minimum order of $${coupon.minOrder} required` };
          } else {
            couponInfo = { valid: true, code: coupon.code, discount, description: coupon.description };
          }
        } else {
          couponInfo = { valid: false, message: 'Invalid or expired coupon code' };
        }
      }

      const discountedSubtotal = subtotal - discount;
      const tax = calculateTax(discountedSubtotal, state);
      const shipping = calculateShipping(shippingMethod, itemCount, discountedSubtotal);
      const total = Math.round((discountedSubtotal + tax + shipping) * 100) / 100;

      return respond({
        items: cart.items,
        itemCount,
        subtotal: Math.round(subtotal * 100) / 100,
        discount: Math.round(discount * 100) / 100,
        coupon: couponInfo,
        tax: Math.round(tax * 100) / 100,
        taxState: state,
        shipping: Math.round(shipping * 100) / 100,
        shippingMethod,
        total,
        shippingMethods: SHIPPING_METHODS
      });
    }

    // POST - place order
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);

      const cartStore = getCartStore();
      const cart = (await cartStore.get(user.sub, { type: 'json' })) || { items: [] };

      if (cart.items.length === 0) {
        return respond({ error: 'Cart is empty. Add items before placing an order.' }, 400);
      }

      // Validate required fields
      if (!body.shippingAddress && body.shippingMethod !== 'pickup') {
        return respond({ error: 'Shipping address is required' }, 400);
      }
      if (!body.paymentMethod) {
        return respond({ error: 'Payment method is required' }, 400);
      }

      // Calculate totals
      const subtotal = cart.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
      const itemCount = cart.items.reduce((sum, i) => sum + i.quantity, 0);
      const state = body.shippingAddress?.state || '';
      const shippingMethod = body.shippingMethod || 'standard';

      // Apply coupon
      let discount = 0;
      let appliedCoupon = null;
      if (body.couponCode) {
        const couponsStore = getCouponsStore();
        const coupons = (await couponsStore.get('active', { type: 'json' })) || [];
        const coupon = coupons.find(c => c.code.toLowerCase() === body.couponCode.toLowerCase() && c.active);
        if (coupon) {
          if (!coupon.minOrder || subtotal >= coupon.minOrder) {
            if (coupon.type === 'percentage') {
              discount = Math.round(subtotal * (coupon.value / 100) * 100) / 100;
            } else if (coupon.type === 'fixed') {
              discount = Math.min(coupon.value, subtotal);
            }
            appliedCoupon = { code: coupon.code, type: coupon.type, value: coupon.value, discount };

            // Decrement usage if applicable
            if (coupon.maxUses) {
              coupon.usedCount = (coupon.usedCount || 0) + 1;
              if (coupon.usedCount >= coupon.maxUses) coupon.active = false;
              await couponsStore.setJSON('active', coupons);
            }
          }
        }
      }

      const discountedSubtotal = subtotal - discount;
      const tax = calculateTax(discountedSubtotal, state);
      const shipping = calculateShipping(shippingMethod, itemCount, discountedSubtotal);
      const total = Math.round((discountedSubtotal + tax + shipping) * 100) / 100;

      // Create order
      const orderNumber = generateOrderNumber();
      const order = {
        id: Date.now(),
        orderNumber,
        status: 'pending',
        paymentStatus: body.paypalOrderId ? 'paid' : (body.paymentMethod === 'paypal' ? 'pending' : 'awaiting'),
        paymentMethod: body.paymentMethod,
        paypalOrderId: body.paypalOrderId || null,

        items: cart.items.map(item => ({
          id: item.id,
          name: item.name,
          type: item.type,
          quantity: item.quantity,
          price: item.price,
          variant: item.variant,
          size: item.size,
          image: item.image,
          giftMessage: item.giftMessage || null
        })),

        subtotal: Math.round(subtotal * 100) / 100,
        discount: Math.round(discount * 100) / 100,
        coupon: appliedCoupon,
        tax: Math.round(tax * 100) / 100,
        taxState: state,
        shipping: Math.round(shipping * 100) / 100,
        shippingMethod,
        total_amount: total,
        total_flies: itemCount,

        shippingAddress: body.shippingAddress || null,
        billingAddress: body.billingAddress || body.shippingAddress || null,
        notes: body.notes || null,
        giftMessage: body.giftMessage || null,
        termsAccepted: body.termsAccepted || false,

        customerEmail: existingUser.email || user.email,
        customerName: existingUser.name || user.name,

        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        estimated_delivery: getEstimatedDelivery(shippingMethod)
      };

      // Save to user's orders
      const ordersStore = getOrdersStore();
      const orders = (await ordersStore.get(user.sub, { type: 'json' })) || [];
      orders.unshift(order);
      await ordersStore.setJSON(user.sub, orders);

      // Save to global orders store (for admin)
      const allOrdersStore = getAllOrdersStore();
      const allOrders = (await allOrdersStore.get('all', { type: 'json' })) || [];
      allOrders.unshift({ ...order, userId: user.sub });
      await allOrdersStore.setJSON('all', allOrders);

      // Save address for future use
      if (body.saveAddress && body.shippingAddress) {
        const addrStore = getAddressBookStore();
        const addresses = (await addrStore.get(user.sub, { type: 'json' })) || [];
        const exists = addresses.find(a =>
          a.street === body.shippingAddress.street && a.zip === body.shippingAddress.zip
        );
        if (!exists) {
          addresses.push({ ...body.shippingAddress, id: Date.now(), created_at: new Date().toISOString() });
          await addrStore.setJSON(user.sub, addresses);
        }
      }

      // Clear cart
      await cartStore.setJSON(user.sub, { items: [], updated_at: new Date().toISOString() });

      // Reduce inventory for ordered items
      try {
        const invStore = getInventoryStore();
        const inventory = (await invStore.get('all', { type: 'json' })) || [];
        let inventoryChanged = false;

        for (const orderItem of cart.items) {
          // Try to find matching inventory item by inventoryId first, then by name+size
          let invItem = null;
          if (orderItem.inventoryId) {
            invItem = inventory.find(i => i.id === parseInt(orderItem.inventoryId) || i.id === orderItem.inventoryId);
          }
          if (!invItem && orderItem.name) {
            if (orderItem.size) {
              invItem = inventory.find(i => i.name === orderItem.name && i.size === orderItem.size);
            }
            if (!invItem) {
              invItem = inventory.find(i => i.name === orderItem.name);
            }
          }
          if (invItem) {
            const reduceBy = orderItem.quantity || 1;
            invItem.qty = Math.max(0, invItem.qty - reduceBy);
            invItem.sold = (invItem.sold || 0) + reduceBy;
            inventoryChanged = true;
          }
        }

        if (inventoryChanged) {
          await invStore.setJSON('all', inventory);
        }
      } catch (invErr) {
        console.error('Inventory reduction error:', invErr);
        // Don't fail the order if inventory update fails
      }

      return respond(order);
    }

    return respond({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('Checkout error:', err);
    return respond({ error: err.message }, 500);
  }
};

function getEstimatedDelivery(method) {
  const now = new Date();
  const days = method === 'express' ? 2 : method === 'priority' ? 3 : method === 'pickup' ? 1 : 7;
  now.setDate(now.getDate() + days);
  return now.toISOString();
}
