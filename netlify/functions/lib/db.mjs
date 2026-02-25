import { getStore } from '@netlify/blobs';

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
