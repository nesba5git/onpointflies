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

export function getInventoryStore() {
  return getStore({ name: 'inventory', consistency: 'eventual' });
}

export function getUploadsStore() {
  return getStore({ name: 'uploads', consistency: 'eventual' });
}
