// collision/gbcr-collision.js
// The DOM-API strategy under test. Narrow-phase uses getBoundingClientRect.
//
// Two sub-modes share this file:
//   - 'gbcr'      : batched. prepare() reads ALL candidate rects once (one
//                   style flush), then hit() compares cached rects. This is the
//                   recommended "write all, then read all" order.
//   - 'gbcr-naive': no caching. hit() calls gBCR on both elements every check,
//                   forcing a style flush per pair. This demonstrates the cost.
//
// Caveats handled/known (see also README):
//   - gBCR returns viewport-space boxes. All entities share one camera parent
//     transform, so every rect is in the same space within a frame. We never
//     cache rects across camera moves (prepare() runs fresh each frame).
//   - gBCR on a rotated element returns an inflated axis-aligned box. Bullets
//     are not rotated for collision; visual-only rotation lives on inner nodes
//     where needed.
//   - Motion is driven by JS per frame (no CSS transitions on colliders), so
//     gBCR returns the logical position, not an interpolated one.

export class GbcrCollision {
  // naive: boolean. profiler: LoopProfiler.
  constructor(profiler, naive = false) {
    this.prof = profiler;
    this.naive = naive;
    this._rects = new WeakMap(); // entity -> cached DOMRect for this frame
  }

  beginFrame() {
    this._rects = new WeakMap();
  }

  // Batched read of all candidate rects (one forced style flush for the set).
  prepare(entities) {
    if (this.naive) return; // naive reads lazily per check
    this.prof && this.prof.begin('col.gbcr');
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (!e.alive || !e.isConnected) continue;
      this._rects.set(e, e.getBoundingClientRect());
      this.prof && this.prof.count('gbcrCalls');
    }
    this.prof && this.prof.end('col.gbcr');
  }

  _rect(e) {
    if (this.naive) {
      this.prof && this.prof.count('gbcrCalls');
      return e.getBoundingClientRect();
    }
    return this._rects.get(e);
  }

  hit(a, b) {
    const ra = this._rect(a);
    const rb = this._rect(b);
    if (!ra || !rb) return false;
    // AABB overlap in viewport space.
    return ra.left < rb.right && ra.right > rb.left &&
           ra.top < rb.bottom && ra.bottom > rb.top;
  }

  endFrame() {}
}
