// weapons/sniper.js
// Slow, high damage, piercing, with a visible laser sight. The laser is a
// styled element (a thin box) rotated/scaled via transform along the aim
// direction, clipped at the first wall hit via a tile raycast.

import { CONFIG } from '../config.js';
import { Weapon } from './weapon.js';
import { TILE } from '../world/dungeon.js';

export class Sniper extends Weapon {
  constructor() {
    super('sniper');
    this.laserEl = null;
  }

  _ensureLaser(game) {
    if (this.laserEl) return;
    if (!document.getElementById('bh-laser-style')) {
      const st = document.createElement('style');
      st.id = 'bh-laser-style';
      st.textContent = `
        bh-laser {
          position: absolute; left: 0; top: 0; height: 2px; margin-top: -1px;
          transform-origin: 0 50%;
          background: linear-gradient(90deg, rgba(255,60,60,0.9), rgba(255,120,120,0.15));
          box-shadow: 0 0 6px rgba(255,40,40,0.9);
          pointer-events: none;
        }`;
      document.head.appendChild(st);
    }
    const el = document.createElement('bh-laser');
    game.fxLayer.appendChild(el);
    this.laserEl = el;
  }

  // Raycast tiles from the owner along aim to find the first wall hit distance.
  _rayLength(game, x, y, aim, maxLen = 1600) {
    const d = game.dungeon;
    const step = d.ts * 0.5;
    const cx = Math.cos(aim), cy = Math.sin(aim);
    for (let t = 0; t < maxLen; t += step) {
      const px = x + cx * t, py = y + cy * t;
      const tx = (px / d.ts) | 0, ty = (py / d.ts) | 0;
      if (d.tileAt(tx, ty) === TILE.WALL) return t;
    }
    return maxLen;
  }

  // Draw/update the laser sight each frame while this weapon is held.
  updateSight(game, owner, aim) {
    this._ensureLaser(game);
    const len = this._rayLength(game, owner.x, owner.y, aim);
    const el = this.laserEl;
    el.style.display = '';
    el.style.width = len + 'px';
    el.style.transform = `translate3d(${owner.x}px, ${owner.y}px, 0) rotate(${aim}rad)`;
  }

  hideSight() {
    if (this.laserEl) this.laserEl.style.display = 'none';
  }
}
