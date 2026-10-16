// enemies/enemy.js
// Base Enemy custom element. Shared AI: find the nearest player, move toward it
// with tile-based wall sliding, and run a type-specific attack. Subclasses set
// stats in reset()/configure() and implement attack().
//
// Enemies are long-lived relative to bullets, so will-change: transform is set.

import { CONFIG } from '../config.js';
import { Entity } from '../core/entity.js';
import { TILE } from '../world/dungeon.js';

export class Enemy extends Entity {
  constructor() {
    super();
    this.faction = 'enemy';
    this.contactDamage = 0;
    this.fireTimer = 0;
    this.score = 0;
    this.kind = 'enemy';
  }

  // Common connected hook: subclasses call super.connectedCallback() after
  // ensuring their own styles.
  configure(stats) {
    this.maxHp = stats.hp;
    this.hp = stats.hp;
    this.radius = stats.radius;
    this.speed = stats.speed;
    this.contactDamage = stats.contactDamage || 0;
    this.score = stats.score || 0;
    this.stats = stats;
    this.dead = false;
    this.alive = true;
  }

  // Nearest living player (co-op aware).
  _nearestPlayer(game) {
    let best = null, bestD = Infinity;
    for (const p of game.players) {
      if (!p || p.dead) continue;
      const d = (p.x - this.x) ** 2 + (p.y - this.y) ** 2;
      if (d < bestD) { bestD = d; best = p; }
    }
    this._targetDist2 = bestD;
    return best;
  }

  update(dt, game) {
    const target = this._nearestPlayer(game);
    if (!target) return;
    this.onThink(dt, game, target);
  }

  // Default behavior: chase. Override for custom movement.
  onThink(dt, game, target) {
    this.moveToward(game.dungeon, target.x, target.y, this.speed * dt);
    this.attack(dt, game, target);
    this.applyTransform();
  }

  // Move toward a point with axis-separated wall sliding.
  moveToward(d, tx, ty, step) {
    const dx = tx - this.x, dy = ty - this.y;
    const len = Math.hypot(dx, dy) || 1;
    const mx = (dx / len) * step, my = (dy / len) * step;
    if (!this._wallAt(d, this.x + mx, this.y)) this.x += mx;
    if (!this._wallAt(d, this.x, this.y + my)) this.y += my;
  }

  _wallAt(d, x, y) {
    const r = this.radius;
    const pts = [[x - r, y], [x + r, y], [x, y - r], [x, y + r]];
    for (let i = 0; i < pts.length; i++) {
      const tx = (pts[i][0] / d.ts) | 0, ty = (pts[i][1] / d.ts) | 0;
      if (d.tileAt(tx, ty) === TILE.WALL) return true;
    }
    return false;
  }

  attack(dt, game, target) {}

  // Fire a single enemy bullet toward a point.
  shootAt(game, tx, ty, speed, damage, radius = 5) {
    game.audio.enemyShoot();
    const dir = Math.atan2(ty - this.y, tx - this.x);
    game.bullets.spawn(this.x, this.y, dir, speed, {
      life: 3, damage, radius, pierce: 0, owner: this, faction: 'enemy',
    });
  }

  onDeath(source) {
    this.kill();
    this.remove();
  }
}

// Shared base stylesheet fragment used by subclasses.
export const ENEMY_BASE_CSS = `
  position: absolute; left: 0; top: 0;
  border-radius: 50%;
  will-change: transform;
  pointer-events: none;
`;
