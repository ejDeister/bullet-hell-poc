// collision/math-collision.js
// Pure-JS narrow-phase control strategy. Circle-circle on cached logical
// positions. No DOM reads at all. One transform write per entity per frame
// happens elsewhere (render), so this measures the "ideal" cost.

export class MathCollision {
  constructor(profiler) { this.prof = profiler; }

  // Returns true if a and b overlap (circle model on logical x/y/radius).
  hit(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const r = a.radius + b.radius;
    return dx * dx + dy * dy <= r * r;
  }

  // Batch hook (no-op for math; included to match the strategy interface).
  beginFrame() {}
  endFrame() {}
  prepare(entities) {}
}
