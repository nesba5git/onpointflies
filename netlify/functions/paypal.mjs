import { verifyAuth, respond } from './lib/auth.mjs';
import { getCartStore, initBlobsContext } from './lib/db.mjs';

const PAYPAL_CLIENT_ID = (process.env.PAYPAL_CLIENT_ID || '').trim();
const PAYPAL_CLIENT_SECRET = (process.env.PAYPAL_CLIENT_SECRET || '').trim();
const PAYPAL_MODE = (process.env.PAYPAL_MODE || 'sandbox').trim().toLowerCase();

const PAYPAL_BASE_URL = PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

async function getPayPalAccessToken() {
  const credentials = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  const resp = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error('[paypal] Failed to get access token:', resp.status, err);
    throw new Error('Failed to authenticate with PayPal');
  }

  const data = await resp.json();
  return data.access_token;
}

async function createPayPalOrder(amount, items, currency = 'USD') {
  const accessToken = await getPayPalAccessToken();

  const itemTotal = items.reduce((sum, i) => sum + (parseFloat(i.price) * i.quantity), 0);

  const orderPayload = {
    intent: 'CAPTURE',
    purchase_units: [{
      amount: {
        currency_code: currency,
        value: parseFloat(amount).toFixed(2),
        breakdown: {
          item_total: {
            currency_code: currency,
            value: itemTotal.toFixed(2),
          },
          shipping: {
            currency_code: currency,
            value: Math.max(0, parseFloat(amount) - itemTotal).toFixed(2),
          },
        },
      },
      items: items.map(i => ({
        name: i.name.substring(0, 127),
        quantity: String(i.quantity),
        unit_amount: {
          currency_code: currency,
          value: parseFloat(i.price).toFixed(2),
        },
        category: 'PHYSICAL_GOODS',
      })),
    }],
    application_context: {
      brand_name: 'On Point Flies',
      shipping_preference: 'NO_SHIPPING',
      user_action: 'PAY_NOW',
    },
  };

  const resp = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(orderPayload),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error('[paypal] Failed to create order:', resp.status, err);
    throw new Error('Failed to create PayPal order');
  }

  return await resp.json();
}

async function capturePayPalOrder(orderId) {
  const accessToken = await getPayPalAccessToken();
  const safeOrderId = encodeURIComponent(orderId);

  const resp = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${safeOrderId}/capture`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error('[paypal] Failed to capture order:', resp.status, err);
    throw new Error('Failed to capture PayPal payment');
  }

  return await resp.json();
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return respond({}, 204);
  }

  // GET - return PayPal client config (public endpoint, no auth required)
  if (event.httpMethod === 'GET') {
    if (!PAYPAL_CLIENT_ID) {
      return respond({ error: 'PayPal is not configured. Please set PAYPAL_CLIENT_ID environment variable.' }, 503);
    }
    return respond({
      clientId: PAYPAL_CLIENT_ID,
      mode: PAYPAL_MODE,
    });
  }

  // POST endpoints require authentication
  const user = await verifyAuth(event);
  if (!user) return respond({ error: 'Unauthorized' }, 401);

  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    return respond({ error: 'PayPal is not configured on the server.' }, 503);
  }

  try {
    initBlobsContext(event);
    const body = JSON.parse(event.body || '{}');
    const action = body.action;

    // Create a PayPal order
    if (action === 'create') {
      const cartStore = getCartStore();
      const cart = (await cartStore.get(user.sub, { type: 'json' })) || { items: [] };

      if (!cart.items || cart.items.length === 0) {
        return respond({ error: 'Cart is empty' }, 400);
      }

      const total = parseFloat(body.total);
      if (!total || total <= 0) {
        return respond({ error: 'Invalid order total' }, 400);
      }

      const order = await createPayPalOrder(total, cart.items);
      return respond({ id: order.id, status: order.status });
    }

    // Capture an approved PayPal order
    if (action === 'capture') {
      const orderId = body.orderId;
      if (!orderId) {
        return respond({ error: 'PayPal order ID is required' }, 400);
      }

      const capture = await capturePayPalOrder(orderId);
      return respond({
        id: capture.id,
        status: capture.status,
        payer: capture.payer ? { email: capture.payer.email_address, name: capture.payer.name } : null,
      });
    }

    return respond({ error: 'Invalid action. Use "create" or "capture".' }, 400);
  } catch (err) {
    console.error('[paypal] Error:', err);
    return respond({ error: err.message }, 500);
  }
};
