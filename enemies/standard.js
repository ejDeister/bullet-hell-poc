// enemies/standard.js
// <bh-standard>: approaches the player, keeps some range, fires bullets, and
// deals heavier contact damage.

import { CONFIG } from '../config.js';
import { Enemy, ENEMY_BASE_CSS } from './enemy.js';

export class Standard extends Enemy {
  static styleId = 'bh-standard';
  static css = `
    bh-standard {
      ${ENEMY_BASE_CSS}
      width: 32px; height: 32px; margin: -16px 0 0 -16px;
      background: radial-gradient(circle at 40% 35%, #fdd, #e55 55%, #811 100%);
      box-shadow: 0 0 8px rgba(255,80,80,0.6);
    }
  `;

  constructor() { super(); this.kind = 'standard'; }
  connectedCallback() { this.constructor.ensureStyles(); }

  reset() { this.configure(CONFIG.enemies.standard); this.fireTimer = 0; }

  onThink(dt, game, target) {
    const s = this.stats;
    const dx = target.x - this.x, dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    // Keep a preferred range: close in from far, back off if too close.
    const step = this.speed * dt;
    if (dist > s.range * 0.6) this.moveToward(game.dungeon, target.x, target.y, step);
    else if (dist < s.range * 0.3) this.moveToward(game.dungeon, this.x - dx, this.y - dy, step);
    // Fire on cadence when in range.
    this.fireTimer -= dt;
    if (dist < s.range && this.fireTimer <= 0) {
      this.fireTimer = 1 / s.fireRate;
      this.shootAt(game, target.x, target.y, s.bulletSpeed, s.bulletDamage, 6);
    }
    this.applyTransform();
  }
}
customElements.define('bh-standard', Standard);
