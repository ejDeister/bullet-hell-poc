// projectiles/explosion.js
// <bh-explosion>: a one-shot area-damage burst with an expanding visual.
// The damage is applied once on spawn (it is not a persistent collider), so a
// CSS keyframe animation for the visual is fine here.

import { Entity } from '../core/entity.js';

export class Explosion extends Entity {
  static styleId = 'bh-explosion';
  static css = `
    bh-explosion {
      position: absolute; left: 0; top: 0;
      border-radius: 50%;
      pointer-events: none;
      background: radial-gradient(circle, rgba(255,240,180,0.95), rgba(255,140,40,0.6) 50%, rgba(255,60,0,0) 75%);
      transform-origin: center;
      animation: bh-boom 0.4s ease-out forwards;
    }
    @keyframes bh-boom {
      0%   { opacity: 0.9; transform: translate3d(var(--ex), var(--ey), 0) scale(0.2); }
      100% { opacity: 0;   transform: translate3d(var(--ex), var(--ey), 0) scale(1); }
    }
  `;

  connectedCallback() { this.constructor.ensureStyles(); }

  // Fire once: apply AoE then animate and self-remove.
  boom(game, x, y, radius, damage, faction, owner) {
    this.constructor.ensureStyles();
    const d = radius * 2;
    this.style.width = d + 'px';
    this.style.height = d + 'px';
    this.style.marginLeft = -radius + 'px';
    this.style.marginTop = -radius + 'px';
    this.style.setProperty('--ex', x + 'px');
    this.style.setProperty('--ey', y + 'px');
    game.fxLayer.appendChild(this);
    if (game.audio) game.audio.explosion();
    game.areaDamage(x, y, radius, damage, faction, owner);
    setTimeout(() => this.remove(), 420);
  }
}
customElements.define('bh-explosion', Explosion);

// Helper so callers do not repeat element creation.
export function spawnExplosion(game, x, y, radius, damage, faction, owner) {
  const ex = document.createElement('bh-explosion');
  ex.boom(game, x, y, radius, damage, faction, owner);
  return ex;
}
