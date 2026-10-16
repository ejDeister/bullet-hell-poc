// bosses/boss1.js
// Boss 1: a large, slow, tanky enemy that shoots BOMBS. Each bomb explodes and
// spawns Swarmers from the blast (see projectiles/bomb.js).

import { CONFIG } from '../config.js';
import { Boss, ENEMY_BASE_CSS } from './boss.js';
import { Bomb } from '../projectiles/bomb.js';

export class Boss1 extends Boss {
  static styleId = 'bh-boss1';
  static css = `
    bh-boss1 {
      ${ENEMY_BASE_CSS}
      width: 92px; height: 92px; margin: -46px 0 0 -46px;
      border-radius: 18px;
      background: radial-gradient(circle at 38% 32%, #fce, #b36 55%, #502 100%);
      box-shadow: 0 0 20px rgba(220,60,120,0.6), inset 0 0 20px rgba(0,0,0,0.5);
    }
  `;

  constructor() { super(); this.kind = 'boss1'; this.name = 'The Brood Mortar'; }
  connectedCallback() { this.constructor.ensureStyles(); }

  reset() { this.configure(CONFIG.bosses.boss1); }

  onThink(dt, game, target) {
    const b = this.stats;
    this.moveToward(game.dungeon, target.x, target.y, this.speed * dt);
    this.everyT('bomb', 1 / b.bombFireRate, dt, () => {
      const bomb = new Bomb();
      // Lob toward a point near the player (lead the target slightly).
      bomb.launch(game, this.x, this.y, target.x, target.y, this);
      game.projectiles.push(bomb);
    });
    this.applyTransform();
  }
}
customElements.define('bh-boss1', Boss1);
