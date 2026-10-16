// weapons/weapon.js
// Base Weapon class. A weapon fires Bullets from the owner toward an aim angle,
// respecting fire rate, spread, and pellet count. Stats come from CONFIG.weapons.
// Ammo is infinite (no reload); fire rate is the limiter.

import { CONFIG } from '../config.js';

export class Weapon {
  constructor(id) {
    this.id = id;
    this.stats = CONFIG.weapons[id];
    this.cooldown = 0;        // seconds until next shot allowed
    this.hasLaser = !!this.stats.laser;
  }

  get speedPenalty() { return this.stats.speedPenalty; }
  get auto() { return this.stats.auto; }

  tick(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
  }

  canFire() { return this.cooldown <= 0; }

  // owner: the firing entity. aim: radians. Returns true if it fired.
  fire(game, owner, aim) {
    if (!this.canFire()) return false;
    const s = this.stats;
    this.cooldown = 1 / s.fireRate;
    const muzzle = owner.radius + 10;
    const ox = owner.x + Math.cos(aim) * muzzle;
    const oy = owner.y + Math.sin(aim) * muzzle;
    for (let i = 0; i < s.pellets; i++) {
      const spread = (game.rng ? game.rng.range(-s.spread, s.spread) : (Math.random() - 0.5) * 2 * s.spread);
      const dir = aim + spread;
      game.bullets.spawn(ox, oy, dir, s.speed, {
        life: s.life,
        damage: s.damage,
        radius: s.bulletRadius,
        pierce: s.pierce || 0,
        owner,
        faction: owner.faction, // 'player'
      });
    }
    game.onPlayerFire && game.onPlayerFire(this);
    return true;
  }
}
