// collision/collision.js
// Collision strategy interface + runtime mode switch, plus the resolution
// pass that applies the selected narrow-phase to game entities.
//
// Pipeline each frame (after all transforms are written by render):
//   1. Build a broad-phase grid of TARGETS (enemies, players, shields, mines).
//   2. strategy.prepare(candidateElements) -> one batched gBCR read (gbcr mode).
//   3. For every projectile: grid.neighbors() broad-phase, then strategy.hit()
//      narrow-phase against opposing-faction targets.
//   4. Contact damage: enemies vs players.
//
// The strategy object is swapped live from the dev menu via setMode().

import { CONFIG } from '../config.js';
import { Grid } from '../world/grid.js';
import { GbcrCollision } from './gbcr-collision.js';
import { MathCollision } from './math-collision.js';

export class CollisionSystem {
  constructor(profiler) {
    this.prof = profiler;
    this.grid = new Grid();
    this._math = new MathCollision(profiler); // fallback for non-DOM bullets
    this.setMode(CONFIG.collision.mode);
  }

  // Narrow-phase test. When a projectile has no connected element (SVG/canvas
  // render target) a gBCR strategy cannot read it, so fall back to math.
  _hit(a, b) {
    if (this.mode !== 'math' && (!a.isConnected || !b.isConnected)) {
      return this._math.hit(a, b);
    }
    return this.strategy.hit(a, b);
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'math') this.strategy = new MathCollision(this.prof);
    else if (mode === 'gbcr-naive') this.strategy = new GbcrCollision(this.prof, true);
    else this.strategy = new GbcrCollision(this.prof, false);
  }

  // game exposes: players[], enemies[] (incl bosses), bullets[], placeables[]
  resolve(game) {
    const prof = this.prof;
    const strat = this.strategy;

    // Targets that projectiles and contact can hit.
    const targets = [];
    for (const p of game.players) if (p && !p.dead) targets.push(p);
    for (const e of game.enemies) if (!e.dead) targets.push(e);
    for (const pl of game.placeables) if (!pl.dead && pl.collides) targets.push(pl);

    // 1. Broad-phase grid over targets.
    prof.begin('col.grid');
    this.grid.rebuild(targets);
    prof.end('col.grid');

    // 2. Batched narrow-phase prep (gBCR reads everything once).
    // game.bullets is the BulletSystem; its live array is .list.
    const bulletList = game.bullets.list;
    strat.beginFrame();
    const candidates = targets.concat(bulletList);
    strat.prepare(candidates);

    // 3. Projectiles vs targets.
    prof.begin('col.resolve');
    const neigh = [];
    for (let i = 0; i < bulletList.length; i++) {
      const b = bulletList[i];
      if (!b.alive) continue;
      // Dormant bullets (far from players) skip collision to save work.
      if (b.simTier === 'dormant') continue;
      this.grid.neighbors(b.x, b.y, neigh);
      for (let j = 0; j < neigh.length; j++) {
        const t = neigh[j];
        if (t.dead) continue;
        if (!this._canHit(b, t)) continue;
        prof.count('pairChecks');
        if (this._hit(b, t)) {
          if (this._onBulletHit(game, b, t)) break; // bullet consumed
        }
      }
    }
    prof.end('col.resolve');

    // 4. Contact damage: enemies vs players.
    prof.begin('col.contact');
    for (let i = 0; i < game.players.length; i++) {
      const p = game.players[i];
      if (!p || p.dead) continue;
      this.grid.neighbors(p.x, p.y, neigh);
      for (let j = 0; j < neigh.length; j++) {
        const e = neigh[j];
        if (e === p || e.dead || e.faction !== 'enemy') continue;
        if (!e.contactDamage) continue;
        prof.count('pairChecks');
        if (this._hit(p, e)) {
          p.takeContact(e.contactDamage, e);
        }
      }
    }
    prof.end('col.contact');

    strat.endFrame();
  }

  // Which projectile->target pairings are valid.
  _canHit(b, t) {
    if (t === b.owner) return false;
    if (t.faction === b.faction) return false;
    // Shields only interact per their own rule (handled in _onBulletHit).
    if (t.isShield) return b.faction === 'enemy';
    return true;
  }

  // Apply a bullet hit. Returns true if the bullet is consumed.
  _onBulletHit(game, b, t) {
    // Bubble shield: block enemy bullets crossing from outside.
    if (t.isShield) {
      if (t.blocksBullet(b)) {
        t.damage(b.damage, b);
        return true;
      }
      return false;
    }
    // Avoid hitting the same target twice while piercing.
    if (b._hitSet && b._hitSet.has(t)) return false;
    const killed = t.damage(b.damage, b);
    if (killed) game.onKill(t, b.owner);
    else if (b.damage > 0) game.audio.hit();
    if (b.pierceLeft > 0) {
      b.pierceLeft--;
      (b._hitSet || (b._hitSet = new Set())).add(t);
      return false; // keep flying
    }
    b.kill();
    return true;
  }
}
