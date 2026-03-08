import { getStore, connectLambda } from '@netlify/blobs';

// Initialize Netlify Blobs context from the Lambda event.
// In v1 functions the blobs token and site info are passed via the event
// object; connectLambda extracts them and sets the environment context so
// that subsequent getStore() calls succeed.
export function initBlobsContext(event) {
  if (event?.blobs) {
    try {
      connectLambda(event);
    } catch {
      // Context may already be configured (e.g. via NETLIFY_BLOBS_CONTEXT)
    }
  }
}

export function getUserStore() {
  return getStore({ name: 'users', consistency: 'eventual' });
}

export function getFavoritesStore() {
  return getStore({ name: 'favorites', consistency: 'eventual' });
}

export function getShoppingListStore() {
  return getStore({ name: 'shopping-list', consistency: 'eventual' });
}

export function getOrdersStore() {
  return getStore({ name: 'orders', consistency: 'eventual' });
}

export function getCatalogStore() {
  return getStore({ name: 'catalog', consistency: 'eventual' });
}

export function getCatalogStoreStrong() {
  return getStore({ name: 'catalog', consistency: 'strong' });
}

export function getInventoryStore() {
  return getStore({ name: 'inventory', consistency: 'eventual' });
}

export function getInventoryStoreStrong() {
  return getStore({ name: 'inventory', consistency: 'strong' });
}

export function getUploadsStore() {
  return getStore({ name: 'uploads', consistency: 'eventual' });
}

export function getCartStore() {
  return getStore({ name: 'cart', consistency: 'eventual' });
}

export function getSaveForLaterStore() {
  return getStore({ name: 'save-for-later', consistency: 'eventual' });
}

export function getCouponsStore() {
  return getStore({ name: 'coupons', consistency: 'eventual' });
}

export function getAddressBookStore() {
  return getStore({ name: 'address-book', consistency: 'eventual' });
}

export function getAllOrdersStore() {
  return getStore({ name: 'all-orders', consistency: 'eventual' });
}

export function getRecentlyViewedStore() {
  return getStore({ name: 'recently-viewed', consistency: 'eventual' });
}
