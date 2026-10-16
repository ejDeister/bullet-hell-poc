// projectiles/bomb.js
// <bh-bomb>: fired by Boss 1. Travels, explodes, and SPAWNS Swarmers from the
// blast. Larger and slower than a grenade.

import { CONFIG } from '../config.js';
import { Entity } from '../core/entity.js';
import { spawnExplosion } from './explosion.js';

export class Bomb extends Entity {
  static styleId = 'bh-bomb';
  static css = `
    bh-bomb {
      position: absolute; left: 0; top: 0;
      width: 24px; height: 24px; margin: -12px 0 0 -12px;
      border-radius: 50%;
      background: radial-gradient(circle at 38% 32%, #fdd, #b22 55%, #400 100%);
      box-shadow: 0 0 10px rgba(255,60,60,0.7);
      pointer-events: none;
    }
  `;

  constructor() {
    super();
    this.faction = 'enemy';
    this.radius = 12;
  }

  connectedCallback() { this.constructor.ensureStyles(); }

  launch(game, x, y, tx, ty, owner) {
    this.game = game;
    this.x = x; this.y = y; this.owner = owner;
    const dx = tx - x, dy = ty - y;
    const dist = Math.hypot(dx, dy) || 1;
    const sp = CONFIG.bosses.boss1.bombSpeed;
    this.vx = (dx / dist) * sp;
    this.vy = (dy / dist) * sp;
    this.fuse = dist / sp;
    this.alive = true; this.dead = false;
    this._lastTransform = '';
    game.fxLayer.appendChild(this);
    this.applyTransform();
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.fuse -= dt;
    this.rot += dt * 4;
    this.applyTransform();
    if (this.fuse <= 0) this.detonate();
  }

  detonate() {
    const b = CONFIG.bosses.boss1;
    spawnExplosion(this.game, this.x, this.y, b.bombRadius, b.bombDamage, 'enemy', this.owner);
    // Spawn swarmers from the blast.
    for (let i = 0; i < b.swarmersPerBomb; i++) {
      const a = (i / b.swarmersPerBomb) * Math.PI * 2;
      const r = b.bombRadius * 0.5;
      this.game.spawnEnemy('swarmer', this.x + Math.cos(a) * r, this.y + Math.sin(a) * r);
    }
    this.kill();
    this.remove();
  }
}
customElements.define('bh-bomb', Bomb);
