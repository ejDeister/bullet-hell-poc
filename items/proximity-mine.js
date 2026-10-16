// items/proximity-mine.js
// <bh-mine>: placed at the player's position, arms after a short delay, and
// detonates when an enemy (or an opposing player in PvP) enters its radius.

import { CONFIG } from '../config.js';
import { Entity } from '../core/entity.js';
import { registerItem } from './item.js';
import { spawnExplosion } from '../projectiles/explosion.js';

export class ProximityMine extends Entity {
  static styleId = 'bh-mine';
  static css = `
    bh-mine {
      position: absolute; left: 0; top: 0;
      width: 20px; height: 20px; margin: -10px 0 0 -10px;
      border-radius: 50%;
      background: radial-gradient(circle, #555, #222);
      border: 2px solid #f55;
      pointer-events: none;
    }
    bh-mine.armed { animation: bh-mine-blink 0.6s infinite; }
    @keyframes bh-mine-blink { 0%,100%{border-color:#f55;} 50%{border-color:#ff2;} }
  `;

  constructor() {
    super();
    this.faction = 'player';
    this.collides = false;   // detection is custom (radius), not pair-based
    this.armed = false;
    this.radius = 10;
  }
  connectedCallback() { this.constructor.ensureStyles(); }

  place(game, owner) {
    this.game = game;
    this.owner = owner;
    this.x = owner.x; this.y = owner.y;
    this.armTimer = CONFIG.items.proximityMine.armDelay;
    this.life = CONFIG.items.proximityMine.life;
    this.triggerRadius = CONFIG.items.proximityMine.radius;
    this.dead = false; this.alive = true; this.armed = false;
    this._lastTransform = '';
    game.fxLayer.appendChild(this);
    this.applyTransform();
  }

  update(dt, game) {
    this.life -= dt;
    if (this.life <= 0) { this._remove(); return; }
    if (!this.armed) {
      this.armTimer -= dt;
      if (this.armTimer <= 0) { this.armed = true; this.classList.add('armed'); }
      return;
    }
    // Check enemies within trigger radius.
    const r2 = this.triggerRadius * this.triggerRadius;
    for (const e of game.enemies) {
      if (e.dead) continue;
      const dx = e.x - this.x, dy = e.y - this.y;
      if (dx * dx + dy * dy <= r2) { this._detonate(game); return; }
    }
  }

  _detonate(game) {
    const cfg = CONFIG.items.proximityMine;
    spawnExplosion(game, this.x, this.y, cfg.radius, cfg.damage, 'player', this.owner);
    this._remove();
  }

  _remove() { this.dead = true; this.alive = false; this.remove(); }
}
customElements.define('bh-mine', ProximityMine);

registerItem('proximityMine', {
  name: 'Proximity Mine',
  icon: '◉',
  use(game, player) {
    const m = new ProximityMine();
    m.place(game, player);
    game.placeables.push(m);
    return true;
  },
});
