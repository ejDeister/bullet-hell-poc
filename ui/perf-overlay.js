// ui/perf-overlay.js
// <bh-perf>: the performance overlay. Shows FPS, frame time (avg/p95/max), a
// small frame-time graph, per-system timings, and counters. Reads from the
// LoopProfiler each frame. Toggle from the dev menu.

export class PerfOverlay extends HTMLElement {
  static css = `
    bh-perf {
      position: fixed; top: 8px; left: 8px; z-index: 50;
      width: 280px; padding: 8px 10px;
      font: 11px/1.4 ui-monospace, Menlo, monospace;
      color: #cfe; background: rgba(8,10,20,0.82);
      border: 1px solid #2a3350; border-radius: 6px;
      pointer-events: none; white-space: pre;
      display: none;
    }
    bh-perf.visible { display: block; }
    bh-perf canvas { display:block; width:260px; height:46px; margin:4px 0; background:#0b0f1e; border:1px solid #223; }
    bh-perf .fps-good { color:#6f6; } bh-perf .fps-bad { color:#f66; } bh-perf .fps-warn { color:#fd6; }
  `;

  connectedCallback() {
    if (!document.getElementById('bh-perf-style')) {
      const s = document.createElement('style');
      s.id = 'bh-perf-style';
      s.textContent = PerfOverlay.css;
      document.head.appendChild(s);
    }
    this.innerHTML = `<div class="head"></div><canvas width="260" height="46"></canvas><div class="body"></div>`;
    this.headEl = this.querySelector('.head');
    this.bodyEl = this.querySelector('.body');
    this.canvas = this.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
  }

  // prof: LoopProfiler. extra: object of extra counters (entities, dom nodes...).
  render(prof, extra = {}) {
    if (!this.headEl) return;
    const st = prof.stats();
    const fps = prof.fps.toFixed(0);
    const cls = prof.fps >= 55 ? 'fps-good' : prof.fps >= 30 ? 'fps-warn' : 'fps-bad';
    this.headEl.innerHTML =
      `<span class="${cls}">${fps} FPS</span>  ` +
      `frame ${st.avg.toFixed(1)} / p95 ${st.p95.toFixed(1)} / max ${st.max.toFixed(1)} ms`;

    // Graph: frame times, with a 16.7ms reference line.
    const c = this.ctx, w = this.canvas.width, h = this.canvas.height;
    c.clearRect(0, 0, w, h);
    const ft = prof.frameTimes;
    const scale = h / 50; // 50ms full height
    c.strokeStyle = '#2a4'; c.beginPath();
    const y167 = h - 16.7 * scale; c.moveTo(0, y167); c.lineTo(w, y167); c.stroke();
    c.strokeStyle = '#6cf'; c.beginPath();
    for (let i = 0; i < ft.length; i++) {
      const x = (i / prof.maxSamples) * w;
      const y = Math.max(0, h - ft[i] * scale);
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.stroke();

    // Per-system timings.
    const sys = prof.systems;
    const names = Object.keys(sys).sort((a, b) => sys[b] - sys[a]);
    let lines = 'systems (ms/frame):\n';
    for (const n of names) lines += `  ${n.padEnd(14)} ${sys[n].toFixed(2)}\n`;
    lines += '\ncounters:\n';
    const cnt = { ...prof.counters, ...extra };
    for (const k of Object.keys(cnt)) {
      const v = cnt[k];
      lines += `  ${k.padEnd(14)} ${typeof v === 'number' ? v.toFixed ? (Number.isInteger(v) ? v : v.toFixed(1)) : v : v}\n`;
    }
    this.bodyEl.textContent = lines;
  }
}
customElements.define('bh-perf', PerfOverlay);
