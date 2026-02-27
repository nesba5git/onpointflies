// api.js - On Point Flies API Client
// Communicates with Netlify Functions backend backed by Netlify Blobs
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
    } catch (e) {
      console.error('Migration error:', e);
    }
  },
};
