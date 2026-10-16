// world/virtualizer.js
// Sim-distance tiers + DOM virtualization.
//
//  - active:  full sim, DOM present, collision on.
//  - near:    reduced sim (update every nearStride frames), DOM kept, collision coarse.
//  - dormant: sim paused, DOM element detached/pooled, state kept as plain data.
//
// Walls follow the same rule: only wall rects near the camera get an element.
// Distance is measured to the NEAREST player so co-op considers both players.

import { CONFIG } from '../config.js';
import { Wall } from './wall.js';

export class Virtualizer {
  constructor(entityContainer, wallContainer) {
    this.container = entityContainer;        // entities attach/detach here
    this.wallContainer = wallContainer || entityContainer; // walls go here
    this.enabled = true;
    this.frame = 0;
    // Wall virtualization state.
    this.wallPool = [];
    this.activeWalls = new Map(); // rectIndex -> Wall element
  }

  // players: array of {x, y}. entities: live sim entities (not walls/bullets).
  classify(entities, players) {
    this.frame++;
    const cfg = CONFIG.sim;
    const a2 = cfg.activeRadius * cfg.activeRadius;
    const n2 = cfg.nearRadius * cfg.nearRadius;

    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (e.dead) continue;
      if (!this.enabled) { this._setTier(e, 'active'); continue; }

      const d2 = this._nearestDist2(e, players);
      let tier;
      if (d2 <= a2) tier = 'active';
      else if (d2 <= n2) tier = 'near';
      else tier = 'dormant';
      this._setTier(e, tier);
    }
  }

  _nearestDist2(e, players) {
    let best = Infinity;
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (!p || p.dead) continue;
      const dx = e.x - p.x, dy = e.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) best = d2;
    }
    return best;
  }

  _setTier(e, tier) {
    if (e.simTier === tier) {
      // keep DOM detach/attach consistent
      if (tier === 'dormant' && e.isConnected) this._detach(e);
      return;
    }
    const prev = e.simTier;
    e.simTier = tier;
    if (tier === 'dormant') {
      this._detach(e);
    } else if (prev === 'dormant') {
      this._attach(e);
    }
  }

  _detach(e) {
    // Keep logical state (x/y/hp in JS fields + dataset). Remove element.
    if (e.isConnected) e.remove();
    e._virtualized = true;
  }

  _attach(e) {
    if (!e.isConnected) {
      this.container.appendChild(e);
      e._lastTransform = '';
      e.applyTransform();
    }
    e._virtualized = false;
  }

  // Should this entity run full sim this frame?
  shouldSim(e) {
    if (!this.enabled) return !e.dead;
    if (e.simTier === 'active') return true;
    if (e.simTier === 'near') return (this.frame % CONFIG.sim.nearStride) === 0;
    return false; // dormant
  }

  // ---- wall virtualization ---------------------------------------------
  // Materialize wall rects within wallRadius of the camera center; pool the rest.
  updateWalls(dungeon, camera) {
    if (!CONFIG.sim.virtualizeWalls) {
      // Materialize everything once.
      if (this.activeWalls.size !== dungeon.wallRects.length) {
        this._clearWalls();
        for (let i = 0; i < dungeon.wallRects.length; i++) this._showWall(i, dungeon.wallRects[i]);
      }
      return;
    }
    const r = CONFIG.sim.wallRadius;
    const r2 = r * r;
    const cam = camera;
    const rects = dungeon.wallRects;
    // Hide out-of-range.
    for (const [idx, el] of this.activeWalls) {
      const rect = rects[idx];
      const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
      const dx = cx - cam.x, dy = cy - cam.y;
      if (dx * dx + dy * dy > r2 * 1.2) {
        this._hideWall(idx);
      }
    }
    // Show in-range.
    for (let i = 0; i < rects.length; i++) {
      if (this.activeWalls.has(i)) continue;
      const rect = rects[i];
      const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
      const dx = cx - cam.x, dy = cy - cam.y;
      if (dx * dx + dy * dy <= r2) this._showWall(i, rect);
    }
  }

  _showWall(idx, rect) {
    let el = this.wallPool.pop();
    if (!el) el = document.createElement('bh-wall');
    el.setBox(rect.x, rect.y, rect.w, rect.h);
    el.style.display = '';
    this.wallContainer.appendChild(el);
    this.activeWalls.set(idx, el);
  }

  _hideWall(idx) {
    const el = this.activeWalls.get(idx);
    if (!el) return;
    el.remove();
    el.alive = false;
    this.wallPool.push(el);
    this.activeWalls.delete(idx);
  }

  _clearWalls() {
    for (const [, el] of this.activeWalls) { el.remove(); this.wallPool.push(el); }
    this.activeWalls.clear();
  }

  counts(entities) {
    let active = 0, near = 0, dormant = 0;
    for (const e of entities) {
      if (e.dead) continue;
      if (e.simTier === 'active') active++;
      else if (e.simTier === 'near') near++;
      else dormant++;
    }
    return { active, near, dormant };
  }
}
