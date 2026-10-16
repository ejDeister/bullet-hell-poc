// core/loop-profiler.js
// Frame timing, per-system timings, and counters. Uses performance.now() and
// performance.mark/measure so traces also appear in the DevTools Performance panel.

export class LoopProfiler {
  constructor() {
    this.frameTimes = [];      // recent total frame times (ms)
    this.maxSamples = 180;
    this.systems = {};         // name -> ms this frame
    this._marks = {};          // name -> start time
    this.counters = {};        // arbitrary per-frame counters
    this.lastFrameMs = 0;
    this.fps = 0;
    this._fpsAccum = 0;
    this._fpsFrames = 0;
    this._fpsClock = performance.now();
    this.useUserTiming = true; // emit performance.mark/measure
  }

  frameStart() {
    this._frameStart = performance.now();
    this.systems = {};
    this.counters = {};
  }

  // Wrap a system: begin(name) ... end(name).
  begin(name) {
    this._marks[name] = performance.now();
    if (this.useUserTiming) performance.mark(`${name}:start`);
  }

  end(name) {
    const t = performance.now() - (this._marks[name] || performance.now());
    this.systems[name] = (this.systems[name] || 0) + t;
    if (this.useUserTiming) {
      performance.mark(`${name}:end`);
      try { performance.measure(name, `${name}:start`, `${name}:end`); } catch (e) {}
    }
  }

  // Convenience: time a function.
  time(name, fn) {
    this.begin(name);
    const r = fn();
    this.end(name);
    return r;
  }

  count(name, n = 1) {
    this.counters[name] = (this.counters[name] || 0) + n;
  }

  set(name, v) {
    this.counters[name] = v;
  }

  frameEnd() {
    const ms = performance.now() - this._frameStart;
    this.lastFrameMs = ms;
    this.frameTimes.push(ms);
    if (this.frameTimes.length > this.maxSamples) this.frameTimes.shift();

    // Rolling FPS over ~0.5s.
    this._fpsFrames++;
    const now = performance.now();
    if (now - this._fpsClock >= 500) {
      this.fps = (this._fpsFrames * 1000) / (now - this._fpsClock);
      this._fpsFrames = 0;
      this._fpsClock = now;
    }
    if (this.useUserTiming) performance.clearMarks();
  }

  // Frame-time stats over the sample window.
  stats() {
    const arr = this.frameTimes;
    if (!arr.length) return { avg: 0, p95: 0, max: 0 };
    const sorted = [...arr].sort((a, b) => a - b);
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    const max = sorted[sorted.length - 1];
    return { avg, p95, max };
  }
}
