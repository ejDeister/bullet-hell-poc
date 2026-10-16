// enemies/tank.js
// <bh-tank>: slow, high HP, fires arcing grenades that explode with area damage.

import { CONFIG } from '../config.js';
import { Enemy, ENEMY_BASE_CSS } from './enemy.js';
import { Grenade } from '../projectiles/grenade.js';

export class Tank extends Enemy {
  static styleId = 'bh-tank';
  static css = `
    bh-tank {
      ${ENEMY_BASE_CSS}
      width: 52px; height: 52px; margin: -26px 0 0 -26px;
      border-radius: 10px;
      background: linear-gradient(145deg, #7a6, #354);
      box-shadow: 0 0 10px rgba(120,180,120,0.5), inset 0 0 12px rgba(0,0,0,0.5);
    }
  `;

  constructor() { super(); this.kind = 'tank'; }
  connectedCallback() { this.constructor.ensureStyles(); }

  reset() { this.configure(CONFIG.enemies.tank); this.fireTimer = 0; }

  onThink(dt, game, target) {
    const s = this.stats;
    const dist = Math.hypot(target.x - this.x, target.y - this.y);
    if (dist > s.range * 0.7) this.moveToward(game.dungeon, target.x, target.y, this.speed * dt);
    this.fireTimer -= dt;
    if (dist < s.range && this.fireTimer <= 0) {
      this.fireTimer = 1 / s.fireRate;
      const g = new Grenade();
      g.launch(game, this.x, this.y, target.x, target.y, this);
      game.projectiles.push(g);
    }
    this.applyTransform();
  }
}
customElements.define('bh-tank', Tank);
