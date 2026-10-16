// enemies/swarmer.js
// <bh-swarmer>: fast, weak, melee only. Spawns in groups. The group-pressure
// enemy. No ranged attack; damage is contact only.

import { CONFIG } from '../config.js';
import { Enemy, ENEMY_BASE_CSS } from './enemy.js';

export class Swarmer extends Enemy {
  static styleId = 'bh-swarmer';
  static css = `
    bh-swarmer {
      ${ENEMY_BASE_CSS}
      width: 22px; height: 22px; margin: -11px 0 0 -11px;
      background: radial-gradient(circle at 40% 35%, #ffd, #fa0 55%, #940 100%);
      box-shadow: 0 0 6px rgba(255,170,0,0.6);
    }
  `;

  constructor() { super(); this.kind = 'swarmer'; }
  connectedCallback() { this.constructor.ensureStyles(); }

  reset() { this.configure(CONFIG.enemies.swarmer); }

  // Pure chase; contact damage handled by the collision system.
  onThink(dt, game, target) {
    this.moveToward(game.dungeon, target.x, target.y, this.speed * dt);
    this.applyTransform();
  }
}
customElements.define('bh-swarmer', Swarmer);
