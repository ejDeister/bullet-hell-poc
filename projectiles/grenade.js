// projectiles/grenade.js
// <bh-grenade>: an arcing/slow projectile fired by Tank enemies. It travels to
// a target point, then explodes (area damage) on landing or after a fuse.
// The "arc" is faked with a scale pop since this is a top-down view.

import { CONFIG } from '../config.js';
import { Entity } from '../core/entity.js';
import { spawnExplosion } from './explosion.js';

export class Grenade extends Entity {
  static styleId = 'bh-grenade';
  static css = `
    bh-grenade {
      position: absolute; left: 0; top: 0;
      width: 16px; height: 16px; margin: -8px 0 0 -8px;
      border-radius: 50%;
      background: radial-gradient(circle at 40% 35%, #cfe, #3a6 60%, #141 100%);
      box-shadow: 0 0 6px rgba(80,255,120,0.6);
      pointer-events: none;
    }
  `;

  constructor() {
    super();
    this.faction = 'enemy';
    this.radius = 8;
    this.isProjectile = true;
  }

  connectedCallback() { this.constructor.ensureStyles(); }

  launch(game, x, y, tx, ty, owner) {
    this.game = game;
    this.x = x; this.y = y;
    this.owner = owner;
    const dx = tx - x, dy = ty - y;
    const dist = Math.hypot(dx, dy) || 1;
    const sp = CONFIG.enemies.tank.grenadeSpeed;
    this.vx = (dx / dist) * sp;
    this.vy = (dy / dist) * sp;
    this.fuse = dist / sp;      // detonate on arrival
    this.alive = true; this.dead = false;
    this._lastTransform = '';
    game.fxLayer.appendChild(this);
    this.applyTransform();
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.fuse -= dt;
    // arc fake: grow then shrink.
    this.scale = 1 + 0.3 * Math.sin((1 - Math.max(0, this.fuse)) * Math.PI);
    this.applyTransform();
    if (this.fuse <= 0) this.detonate();
  }

  detonate() {
    const t = CONFIG.enemies.tank;
    spawnExplosion(this.game, this.x, this.y, t.grenadeRadius, t.grenadeDamage, 'enemy', this.owner);
    this.kill();
    this.remove();
  }
}
customElements.define('bh-grenade', Grenade);
