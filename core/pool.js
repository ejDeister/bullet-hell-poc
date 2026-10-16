// core/pool.js
// Element pooling, used heavily for bullets. Pooling can be toggled from the
// dev menu (pool.enabled) so we can measure DOM-churn cost of spawn/remove.

import { CONFIG } from '../config.js';

export class Pool {
  // tagName: the custom element tag (e.g. 'bh-bullet').
  // parent:  the DOM container pooled elements attach to.
  constructor(tagName, parent) {
    this.tagName = tagName;
    this.parent = parent;
    this.free = [];
    this.hits = 0;
    this.misses = 0;
  }

  prewarm(n) {
    for (let i = 0; i < n; i++) {
      const el = document.createElement(this.tagName);
      el.style.display = 'none';
      this.free.push(el);
    }
  }

  // Acquire an element. When pooling is off, always make a fresh one (to
  // measure DOM creation cost).
  acquire() {
    if (CONFIG.pool.enabled && this.free.length) {
      this.hits++;
      return this.free.pop();
    }
    this.misses++;
    return document.createElement(this.tagName);
  }

  // Return an element. When pooling is off, detach and drop it for GC.
  release(el) {
    el.style.display = 'none';
    if (el.reset) el.reset();
    if (CONFIG.pool.enabled) {
      if (el.parentNode !== this.parent) {
        // keep detached; we re-append on next acquire-use
      }
      el.remove();
      this.free.push(el);
    } else {
      el.remove();
    }
  }

  get freeCount() { return this.free.length; }
}
