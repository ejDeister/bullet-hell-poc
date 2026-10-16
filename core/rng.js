// core/rng.js
// Seeded PRNG (mulberry32) so host and client generate identical dungeons.
// Deterministic: same seed -> same stream.

export class RNG {
  constructor(seed = 1) {
    this.seed = seed >>> 0;
    this._s = this.seed;
  }

  // Reset the stream back to the original seed.
  reset() {
    this._s = this.seed;
  }

  // Next float in [0, 1).
  next() {
    let t = (this._s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Float in [min, max).
  range(min, max) {
    return min + this.next() * (max - min);
  }

  // Integer in [min, max] inclusive.
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  // Pick a random element.
  pick(arr) {
    return arr[this.int(0, arr.length - 1)];
  }

  // True with probability p.
  chance(p) {
    return this.next() < p;
  }

  // A new independent RNG derived from this stream (for sub-systems).
  fork() {
    return new RNG((this.next() * 0xffffffff) >>> 0);
  }
}

// Hash a string to a 32-bit seed (for named seeds).
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
