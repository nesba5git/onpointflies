import { getStore } from '@netlify/blobs';

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
