import { getCouponsStore, initBlobsContext } from './lib/db.mjs';
import { verifyAuth, verifyAdmin, respond } from './lib/auth.mjs';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return respond({}, 204);
  }

  try {
    initBlobsContext(event);

    // POST - validate a coupon code (authenticated users)
    if (event.httpMethod === 'POST') {
      const user = await verifyAuth(event);
      if (!user) return respond({ error: 'Unauthorized' }, 401);

      const body = JSON.parse(event.body);
      if (!body.code) return respond({ error: 'Coupon code is required' }, 400);

      const store = getCouponsStore();
      const coupons = (await store.get('active', { type: 'json' })) || [];
      const coupon = coupons.find(c => c.code.toLowerCase() === body.code.toLowerCase());

      if (!coupon) {
        return respond({ valid: false, message: 'Invalid coupon code' });
      }
      if (!coupon.active) {
        return respond({ valid: false, message: 'This coupon has expired' });
      }
      if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
        return respond({ valid: false, message: 'This coupon has expired' });
      }
      if (coupon.maxUses && (coupon.usedCount || 0) >= coupon.maxUses) {
        return respond({ valid: false, message: 'This coupon has reached its usage limit' });
      }
      if (body.subtotal && coupon.minOrder && body.subtotal < coupon.minOrder) {
        return respond({
          valid: false,
          message: `Minimum order of $${coupon.minOrder.toFixed(2)} required for this coupon`
        });
      }

      let discount = 0;
      if (body.subtotal) {
        if (coupon.type === 'percentage') {
          discount = Math.round(body.subtotal * (coupon.value / 100) * 100) / 100;
        } else if (coupon.type === 'fixed') {
          discount = Math.min(coupon.value, body.subtotal);
        } else if (coupon.type === 'free_shipping') {
          discount = 0; // Handled during shipping calculation
        }
      }

      return respond({
        valid: true,
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        description: coupon.description,
        discount,
        minOrder: coupon.minOrder || null,
        freeShipping: coupon.type === 'free_shipping'
      });
    }

    // Admin endpoints
    const admin = await verifyAdmin(event);
    if (!admin) return respond({ error: 'Admin access required' }, 403);

    const store = getCouponsStore();

    // GET - list all coupons (admin only)
    if (event.httpMethod === 'GET') {
      const coupons = (await store.get('active', { type: 'json' })) || [];
      return respond(coupons);
    }

    // PUT - create or update coupon (admin only)
    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body);
      if (!body.code || !body.type || body.value === undefined) {
        return respond({ error: 'Code, type, and value are required' }, 400);
      }

      const coupons = (await store.get('active', { type: 'json' })) || [];
      const existIdx = coupons.findIndex(c => c.code.toLowerCase() === body.code.toLowerCase());

      const couponData = {
        code: body.code.toUpperCase(),
        type: body.type, // 'percentage', 'fixed', 'free_shipping'
        value: parseFloat(body.value),
        description: body.description || '',
        minOrder: body.minOrder ? parseFloat(body.minOrder) : null,
        maxUses: body.maxUses ? parseInt(body.maxUses) : null,
        usedCount: existIdx > -1 ? (coupons[existIdx].usedCount || 0) : 0,
        active: body.active !== false,
        expiresAt: body.expiresAt || null,
        created_at: existIdx > -1 ? coupons[existIdx].created_at : new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      if (existIdx > -1) {
        coupons[existIdx] = couponData;
      } else {
        coupons.push(couponData);
      }

      await store.setJSON('active', coupons);
      return respond({ message: existIdx > -1 ? 'Coupon updated' : 'Coupon created', coupon: couponData });
    }

    // DELETE - remove coupon (admin only)
    if (event.httpMethod === 'DELETE') {
      const params = event.queryStringParameters || {};
      if (!params.code) return respond({ error: 'Coupon code is required' }, 400);

      const coupons = (await store.get('active', { type: 'json' })) || [];
      const filtered = coupons.filter(c => c.code.toLowerCase() !== params.code.toLowerCase());
      await store.setJSON('active', filtered);
      return respond({ message: 'Coupon deleted' });
    }

    return respond({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('Coupons error:', err);
    return respond({ error: err.message }, 500);
  }
};
