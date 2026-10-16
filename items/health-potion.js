// items/health-potion.js — heals the player by a configured amount.
import { CONFIG } from '../config.js';
import { registerItem } from './item.js';

registerItem('healthPotion', {
  name: 'Health Potion',
  icon: '+',
  use(game, player) {
    if (player.hp >= player.maxHp) return false; // do not waste at full HP
    player.heal(CONFIG.items.healthPotion.heal);
    return true;
  },
});
