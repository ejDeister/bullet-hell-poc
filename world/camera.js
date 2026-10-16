// world/camera.js
// Camera is a single transform on the world container. All entities live in
// world space; the camera translates the container so the target is centered.
//
// Collision note: because every entity is a child of this container, their
// getBoundingClientRect() values are all in the same viewport space within a
// frame. We never cache rects across camera moves. The camera write happens
// once per frame before reads, so gBCR narrow-phase stays consistent.

import { CONFIG } from '../config.js';

export class Camera {
  constructor(container, viewport) {
    this.container = container;  // the moving world <div>
    this.viewport = viewport;    // the clipping viewport element
    this.x = 0;                  // world coord shown at viewport center
    this.y = 0;
    this._tx = 0;
    this._ty = 0;
  }

  get viewW() { return this.viewport.clientWidth; }
  get viewH() { return this.viewport.clientHeight; }

  // Smoothly follow a target point (world coords).
  follow(tx, ty, dt, instant = false) {
    const lerp = instant ? 1 : CONFIG.camera.lerp;
    this.x += (tx - this.x) * lerp;
    this.y += (ty - this.y) * lerp;
  }

  // Write the transform once per frame.
  apply() {
    this._tx = Math.round(this.viewW / 2 - this.x);
    this._ty = Math.round(this.viewH / 2 - this.y);
    this.container.style.transform = `translate3d(${this._tx}px, ${this._ty}px, 0)`;
  }

  // World -> screen (viewport) coords.
  worldToScreen(wx, wy) {
    return { x: wx + this._tx, y: wy + this._ty };
  }

  // Current visible world bounds (for culling / wall virtualization).
  bounds() {
    return {
      minX: this.x - this.viewW / 2,
      minY: this.y - this.viewH / 2,
      maxX: this.x + this.viewW / 2,
      maxY: this.y + this.viewH / 2,
    };
  }
}
