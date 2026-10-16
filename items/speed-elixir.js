// items/speed-elixir.js — timed movement speed multiplier.
import { CONFIG } from '../config.js';
import { registerItem } from './item.js';

registerItem('speedElixir', {
  name: 'Speed Elixir',
  icon: '»',
  use(game, player) {
    const cfg = CONFIG.items.speedElixir;
    player.speedMult = cfg.multiplier;
    // Clear any prior timer and restore after the duration.
    if (player._speedTimer) clearTimeout(player._speedTimer);
    player._speedTimer = setTimeout(() => {
      player.speedMult = 1;
      player._speedTimer = null;
    }, cfg.duration * 1000);
    return true;
  },
});
