import { getStore, connectLambda } from '@netlify/blobs';

export function initBlobs(event) {
  if (event.blobs) {
    connectLambda(event);
  }
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
