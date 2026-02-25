// api.js - On Point Flies API Client
// Communicates with Netlify Functions backend backed by Neon PostgreSQL
var OPF_API = {
  token: null,

  setToken: async function (auth0Client) {
    try {
      var claims = await auth0Client.getIdTokenClaims();
      if (claims) this.token = claims.__raw;
    } catch (e) {
      console.error('Failed to get auth token:', e);
    }
  },

  request: async function (path, options) {
    options = options || {};
    var headers = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = 'Bearer ' + this.token;

    var response = await fetch('/api/' + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body || undefined,
    });

    var data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Request failed');
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

  // Orders
  getOrders: function () {
    return this.request('orders');
  },
  placeOrder: function (notes) {
    return this.request('orders', {
      method: 'POST',
      body: JSON.stringify({ notes: notes || '' }),
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
    } catch (e) {
      console.error('Migration error:', e);
    }
  },
};
