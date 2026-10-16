// world/wall.js
// <bh-wall> element plus its CSS. Walls are static colliders. They follow the
// same virtualization as entities: only walls near the camera exist in the DOM.
// Wall logical data (tile rects) lives in the dungeon; wall elements are
// materialized/pooled by the virtualizer.

import { Entity } from '../core/entity.js';

export class Wall extends Entity {
  static styleId = 'bh-wall';
  static css = `
    bh-wall {
      position: absolute;
      left: 0; top: 0;
      will-change: transform;
      background: linear-gradient(145deg, #2a2f45, #171a2b);
      border: 1px solid #3b4166;
      box-shadow: inset 0 0 8px rgba(0,0,0,0.5);
      box-sizing: border-box;
      pointer-events: none;
    }
  `;

  constructor() {
    super();
    this.faction = 'wall';
    this.w = 0;
    this.h = 0;
  }

  connectedCallback() {
    this.constructor.ensureStyles();
  }

  // Walls are axis-aligned boxes. We store half extents for math collision.
  setBox(x, y, w, h) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.hw = w / 2; this.hh = h / 2;
    // position is top-left; size via width/height set once (not animated).
    this.style.width = w + 'px';
    this.style.height = h + 'px';
    this._lastTransform = '';
    this.applyTransform();
    this.alive = true;
  }
}

customElements.define('bh-wall', Wall);
