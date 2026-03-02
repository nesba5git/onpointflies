// api.js - On Point Flies API Client
// Communicates with Netlify Functions backend backed by Netlify Blobs
var OPF_API = {
  token: null,
  accessToken: null,

  setToken: async function (auth0Client) {
    try {
      // Force a silent token refresh so the ID token is always current.
      // getTokenSilently() refreshes both access and ID tokens; we then
      // read the fresh ID token claims for our API calls.
      var refreshed = false;
      try {
        var at = await auth0Client.getTokenSilently();
        this.accessToken = at || null;
        refreshed = true;
      } catch (e) {
        console.warn('Silent token refresh failed:', e.message || e);
        this.accessToken = null;
      }
      var claims = await auth0Client.getIdTokenClaims();
      if (claims && claims.__raw) {
        this.token = claims.__raw;
      } else {
        console.warn('No ID token claims available (refreshed=' + refreshed + ')');
        this.token = null;
      }
    } catch (e) {
      console.error('Failed to get auth token:', e);
      this.token = null;
      this.accessToken = null;
    }
  },

  request: async function (path, options) {
    options = options || {};
    var headers = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = 'Bearer ' + this.token;
    if (this.accessToken) headers['X-Access-Token'] = this.accessToken;

    var response = await fetch('/api/' + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body || undefined,
    });

    var data;
    try {
      data = await response.json();
    } catch (e) {
      if (!response.ok) {
        var parseErr = new Error('Request failed (status ' + response.status + ')');
        parseErr.status = response.status;
        throw parseErr;
      }
      throw new Error('Invalid response from server');
    }
    if (!response.ok) {
      var err = new Error(data.error || 'Request failed');
      err.errorCode = data.errorCode || null;
      err.status = response.status;
      throw err;
    }
    return data;
  },

  // User
  syncUser: function () {
    return this.request('user');
  },

  // Favorites
  getFavorites: function () {
    return this.request('favorites');
  },
  addFavorite: function (fly) {
    return this.request('favorites', {
      method: 'POST',
      body: JSON.stringify(fly),
    });
  },
  removeFavorite: function (name) {
    return this.request(
      'favorites?name=' + encodeURIComponent(name),
      { method: 'DELETE' }
    );
  },

  // Shopping List
  getShoppingList: function () {
    return this.request('shopping-list');
  },
  addToShoppingList: function (fly) {
    return this.request('shopping-list', {
      method: 'POST',
      body: JSON.stringify(fly),
    });
  },
  updateShoppingListQty: function (name, qty) {
    return this.request('shopping-list', {
      method: 'PUT',
      body: JSON.stringify({ name: name, quantity: qty }),
    });
  },
  removeFromShoppingList: function (name) {
    return this.request(
      'shopping-list?name=' + encodeURIComponent(name),
      { method: 'DELETE' }
    );
  },
  clearShoppingList: function () {
    return this.request('shopping-list?all=true', { method: 'DELETE' });
  },

  // Cart
  getCart: function (validate) {
    return this.request('cart' + (validate ? '?validate=true' : ''));
  },
  addToCart: function (item) {
    return this.request('cart', {
      method: 'POST',
      body: JSON.stringify({ action: 'add', ...item }),
    });
  },
  updateCartItem: function (itemId, updates) {
    return this.request('cart', {
      method: 'PUT',
      body: JSON.stringify({ itemId: itemId, ...updates }),
    });
  },
  removeCartItem: function (itemId) {
    return this.request('cart?itemId=' + encodeURIComponent(itemId), { method: 'DELETE' });
  },
  removeSavedItem: function (itemId) {
    return this.request('cart?itemId=' + encodeURIComponent(itemId) + '&from=saved', { method: 'DELETE' });
  },
  clearCart: function () {
    return this.request('cart?all=true', { method: 'DELETE' });
  },
  saveForLater: function (itemId) {
    return this.request('cart', {
      method: 'POST',
      body: JSON.stringify({ action: 'save-for-later', itemId: itemId }),
    });
  },
  moveToCart: function (itemId) {
    return this.request('cart', {
      method: 'POST',
      body: JSON.stringify({ action: 'move-to-cart', itemId: itemId }),
    });
  },
  mergeGuestCart: function (items) {
    return this.request('cart', {
      method: 'POST',
      body: JSON.stringify({ action: 'merge', items: items }),
    });
  },

  // Checkout
  getCheckoutPreview: function (state, shippingMethod, coupon) {
    var params = [];
    if (state) params.push('state=' + encodeURIComponent(state));
    if (shippingMethod) params.push('shipping=' + encodeURIComponent(shippingMethod));
    if (coupon) params.push('coupon=' + encodeURIComponent(coupon));
    var qs = params.length > 0 ? '?' + params.join('&') : '';
    return this.request('checkout' + qs);
  },
  getShippingMethods: function () {
    return this.request('checkout?info=shipping');
  },
  getTaxRate: function (state) {
    return this.request('checkout?info=tax&state=' + encodeURIComponent(state));
  },
  placeCheckoutOrder: function (orderData) {
    return this.request('checkout', {
      method: 'POST',
      body: JSON.stringify(orderData),
    });
  },

  // Coupons
  validateCoupon: function (code, subtotal) {
    return this.request('coupons', {
      method: 'POST',
      body: JSON.stringify({ code: code, subtotal: subtotal }),
    });
  },

  // Address Book
  getAddresses: function () {
    return this.request('addresses');
  },
  addAddress: function (address) {
    return this.request('addresses', {
      method: 'POST',
      body: JSON.stringify(address),
    });
  },
  updateAddress: function (address) {
    return this.request('addresses', {
      method: 'PUT',
      body: JSON.stringify(address),
    });
  },
  removeAddress: function (id) {
    return this.request('addresses?id=' + id, { method: 'DELETE' });
  },

  // Orders
  getOrders: function () {
    return this.request('orders');
  },
  getOrder: function (orderId) {
    return this.request('orders?orderId=' + encodeURIComponent(orderId));
  },
  placeOrder: function (notes) {
    return this.request('orders', {
      method: 'POST',
      body: JSON.stringify({ notes: notes || '' }),
    });
  },
  reorder: function (orderId) {
    return this.request('orders', {
      method: 'POST',
      body: JSON.stringify({ action: 'reorder', orderId: orderId }),
    });
  },

  // Admin Orders
  getAdminOrders: function (status) {
    var params = '?admin=true';
    if (status) params += '&status=' + encodeURIComponent(status);
    return this.request('orders' + params);
  },
  updateOrderStatus: function (orderId, status, trackingNumber, adminNotes) {
    return this.request('orders?admin=true', {
      method: 'PUT',
      body: JSON.stringify({
        orderId: orderId,
        status: status,
        trackingNumber: trackingNumber || undefined,
        adminNotes: adminNotes || undefined,
      }),
    });
  },

  // Admin Coupons
  getAdminCoupons: function () {
    return this.request('coupons');
  },
  saveCoupon: function (coupon) {
    return this.request('coupons', {
      method: 'PUT',
      body: JSON.stringify(coupon),
    });
  },
  deleteCoupon: function (code) {
    return this.request('coupons?code=' + encodeURIComponent(code), { method: 'DELETE' });
  },

  // Catalog (public read, authenticated write)
  getCatalog: function () {
    return this.request('catalog');
  },
  addCatalogItem: function (fly) {
    return this.request('catalog', {
      method: 'POST',
      body: JSON.stringify(fly),
    });
  },
  updateCatalogItem: function (data) {
    return this.request('catalog', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
  deleteCatalogItem: function (index) {
    return this.request('catalog?index=' + index, { method: 'DELETE' });
  },

  // Inventory (public read, authenticated write)
  getInventory: function () {
    return this.request('inventory');
  },
  addInventoryItem: function (item) {
    return this.request('inventory', {
      method: 'POST',
      body: JSON.stringify(item),
    });
  },
  updateInventoryItem: function (item) {
    return this.request('inventory', {
      method: 'PUT',
      body: JSON.stringify(item),
    });
  },
  deleteInventoryItem: function (id) {
    return this.request('inventory?id=' + id, { method: 'DELETE' });
  },

  // File Uploads
  uploadFile: function (file, target) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var base64 = reader.result.split(',')[1];
        OPF_API.request('upload', {
          method: 'POST',
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type,
            data: base64,
            target: target || 'general',
          }),
        }).then(resolve).catch(reject);
      };
      reader.onerror = function () { reject(new Error('Failed to read file')); };
      reader.readAsDataURL(file);
    });
  },
  getUploadedFiles: function () {
    return this.request('upload');
  },
  deleteUploadedFile: function (key) {
    return this.request('upload?key=' + encodeURIComponent(key), { method: 'DELETE' });
  },

  // Roles (admin only)
  getUsers: function () {
    return this.request('roles');
  },
  updateUserRole: function (auth0_id, role) {
    return this.request('roles', {
      method: 'PUT',
      body: JSON.stringify({ auth0_id: auth0_id, role: role }),
    });
  },

  // Migrate localStorage data to database (one-time)
  migrateLocalData: async function () {
    try {
      var localFavs = localStorage.getItem('opf_favorites');
      if (localFavs) {
        var favs = JSON.parse(localFavs);
        for (var i = 0; i < favs.length; i++) {
          try {
            await this.addFavorite(favs[i]);
          } catch (e) {
            /* ignore duplicates */
          }
        }
        localStorage.removeItem('opf_favorites');
      }

      var localList = localStorage.getItem('opf_shopping_list');
      if (localList) {
        var items = JSON.parse(localList);
        for (var i = 0; i < items.length; i++) {
          try {
            await this.addToShoppingList(items[i]);
          } catch (e) {
            /* ignore duplicates */
          }
        }
        localStorage.removeItem('opf_shopping_list');
      }

      // Merge guest cart into user cart
      var guestCart = localStorage.getItem('opf_guest_cart');
      if (guestCart) {
        var guestItems = JSON.parse(guestCart);
        if (guestItems && guestItems.length > 0) {
          try {
            await this.mergeGuestCart(guestItems);
          } catch (e) {
            console.error('Guest cart merge error:', e);
          }
        }
        localStorage.removeItem('opf_guest_cart');
      }
    } catch (e) {
      console.error('Migration error:', e);
    }
  },
};

// Guest Cart (localStorage-based for non-authenticated users)
var OPF_GUEST_CART = {
  getItems: function () {
    try {
      return JSON.parse(localStorage.getItem('opf_guest_cart') || '[]');
    } catch (e) { return []; }
  },
  addItem: function (item) {
    var items = this.getItems();
    var existIdx = items.findIndex(function(i) { return i.name === item.name; });
    if (existIdx > -1) {
      items[existIdx].quantity = (items[existIdx].quantity || 1) + (item.quantity || 1);
    } else {
      items.push({
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        name: item.name,
        type: item.type,
        bestFor: item.bestFor,
        description: item.description,
        image: item.image,
        price: parseFloat(item.price) || 2.50,
        quantity: item.quantity || 1,
        variant: item.variant || null,
        size: item.size || null
      });
    }
    localStorage.setItem('opf_guest_cart', JSON.stringify(items));
    return items;
  },
  updateQuantity: function (itemId, quantity) {
    var items = this.getItems();
    var idx = items.findIndex(function(i) { return i.id === itemId; });
    if (idx > -1) {
      items[idx].quantity = Math.max(1, quantity);
      localStorage.setItem('opf_guest_cart', JSON.stringify(items));
    }
    return items;
  },
  removeItem: function (itemId) {
    var items = this.getItems().filter(function(i) { return i.id !== itemId; });
    localStorage.setItem('opf_guest_cart', JSON.stringify(items));
    return items;
  },
  clear: function () {
    localStorage.setItem('opf_guest_cart', '[]');
    return [];
  },
  getCount: function () {
    return this.getItems().reduce(function(sum, i) { return sum + (i.quantity || 1); }, 0);
  },
  getSubtotal: function () {
    return this.getItems().reduce(function(sum, i) { return sum + ((parseFloat(i.price) || 2.50) * (i.quantity || 1)); }, 0);
  }
};
