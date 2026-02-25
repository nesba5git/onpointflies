import { connectLambda, getStore } from '@netlify/blobs';

// V1 (handler-based) functions require connectLambda to initialize the
// Blobs context from the Lambda event. Call this at the top of every handler
// that accesses a store.
export function initBlobsContext(event) {
  connectLambda(event);
}

export function getUserStore() {
  return getStore({ name: 'users', consistency: 'strong' });
}

export function getFavoritesStore() {
  return getStore({ name: 'favorites', consistency: 'strong' });
}

export function getShoppingListStore() {
  return getStore({ name: 'shopping-list', consistency: 'strong' });
}

export function getOrdersStore() {
  return getStore({ name: 'orders', consistency: 'strong' });
}
