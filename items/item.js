// items/item.js
// Item registry. Each item module registers a descriptor with a use() function.
// The player calls game.useItem(player, id); the game delegates here.

export const ITEMS = {};

export function registerItem(id, def) {
  ITEMS[id] = def;
}

// Returns true if the item was consumed.
export function useItem(game, player, id) {
  const d = ITEMS[id];
  if (!d) return false;
  return d.use(game, player) !== false;
}

export function itemName(id) {
  return ITEMS[id] ? ITEMS[id].name : id;
}
export function itemIcon(id) {
  return ITEMS[id] ? ITEMS[id].icon : '?';
}
