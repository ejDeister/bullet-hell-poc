// net/spectator-view.js
// Shared spectator renderer. Both the Presentation receiver (receiver.js) and
// the Cast Custom Receiver (cast-receiver.js) use this. It draws the streamed
// game state on a canvas, or with pooled DOM elements, and shows the FPS
// counter and the performance graph measured ON THIS device.
//
// Feed it with handleMessage(obj) for each 'init' and 'snap' message.

import { CONFIG } from '../config.js';
import { Dungeon } from '../world/dungeon.js';
import { PerfOverlay } from '../ui/perf-overlay.js';

const KIND_COLOR = { standard: '#e55', tank: '#7a6', swarmer: '#fa0' };
const KIND_SIZE = { standard: 16, tank: 26, swarmer: 11 };

export class SpectatorView {
  // opts: { canvas, stage, bannerEl, scoreEl }
  constructor(opts) {
    this.canvas = opts.canvas;
    this.ctx = this.canvas.getContext('2d');
    this.stage = opts.stage;
    this.bannerEl = opts.bannerEl || null;
    this.scoreEl = opts.scoreEl || null;

    this.dungeon = null;
    this.snap = null;
    this.mode = (new URLSearchParams(location.search).get('render')) || CONFIG.cast.receiverRender || 'canvas';

    this.perf = new PerfOverlay();
    document.body.appendChild(this.perf);
    this.perf.classList.add('visible');

    // Local frame measurement.
    this._ft = [];
    this._fps = 0;
    this._frames = 0;
    this._fpsClock = performance.now();
    this._lastFrame = performance.now();

    this._dom = this._makeDomRenderer();

    window.addEventListener('resize', () => this._resize());
    window.addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'r') this.setMode(this.mode === 'canvas' ? 'dom' : 'canvas'); });
    this._resize();
  }

  _resize() { this.canvas.width = window.innerWidth; this.canvas.height = window.innerHeight; }

  // Accept a parsed object or a JSON string.
  handleMessage(data) {
    let msg = data;
    if (typeof data === 'string') { try { msg = JSON.parse(data); } catch { return; } }
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'init') {
      this.dungeon = new Dungeon(msg.seed, msg.endless ? 1000 : msg.dungeonIndex);
      if (msg.render) this.setMode(msg.render);
      this._dom.needWalls = true;
    } else if (msg.t === 'snap') {
      this.snap = msg;
      if (msg.render && msg.render !== this.mode) this.setMode(msg.render);
    }
  }

  setMode(m) {
    if (m === this.mode) return;
    this.mode = m;
    if (m === 'canvas') { this.canvas.style.display = ''; this._dom.hide(); }
    else { this.canvas.style.display = 'none'; this._dom.show(); this._dom.needWalls = true; }
  }

  start() {
    const loop = () => { requestAnimationFrame(loop); this._frame(); };
    requestAnimationFrame(loop);
  }

  _frame() {
    this._measure();
    const w = this.canvas.width, h = this.canvas.height;
    if (this.mode === 'canvas') this._drawCanvas(w, h);
    else this._dom.draw(window.innerWidth, window.innerHeight);

    const snap = this.snap;
    if (snap) {
      if (this.bannerEl) this.bannerEl.textContent = (snap.label || '') + '  [' + this.mode + ']';
      if (this.scoreEl) this.scoreEl.textContent = 'Score ' + snap.score;
      this.perf.render(this._localProf(snap.perf), { render: this.mode });
    }
  }

  // ---- local FPS -------------------------------------------------------
  _measure() {
    const now = performance.now();
    const d = now - this._lastFrame; this._lastFrame = now;
    this._ft.push(d); if (this._ft.length > 120) this._ft.shift();
    this._frames++;
    if (now - this._fpsClock >= 500) { this._fps = (this._frames * 1000) / (now - this._fpsClock); this._frames = 0; this._fpsClock = now; }
  }
  _localStats() {
    if (!this._ft.length) return { avg: 0, p95: 0, max: 0 };
    const s = [...this._ft].sort((a, b) => a - b);
    const avg = this._ft.reduce((a, b) => a + b, 0) / this._ft.length;
    return { avg, p95: s[Math.floor(s.length * 0.95)] || s[s.length - 1], max: s[s.length - 1] };
  }
  _localProf(hostPerf) {
    const h = hostPerf || {};
    const counters = { ...(h.counters || {}) };
    counters.TVrender = this.mode;
    counters.hostFps = h.fps != null ? h.fps : '—';
    return {
      fps: Math.round(this._fps),
      maxSamples: 120,
      frameTimes: this._ft,
      systems: h.systems || {},
      counters,
      stats: () => this._localStats(),
    };
  }

  // ---- shared transform ------------------------------------------------
  _view(w, h, cam) {
    const scale = Math.min(w / cam[2], h / cam[3]);
    return { scale, ox: w / 2 - cam[0] * scale, oy: h / 2 - cam[1] * scale };
  }

  // ---- canvas renderer -------------------------------------------------
  _drawCanvas(w, h) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    const snap = this.snap;
    if (!snap) return;
    const cam = snap.cam;
    const { scale, ox, oy } = this._view(w, h, cam);
    const toX = (x) => x * scale + ox, toY = (y) => y * scale + oy;

    if (this.dungeon) {
      ctx.fillStyle = '#232a44';
      for (const r of this.dungeon.wallRects) {
        if (Math.abs(r.x - cam[0]) > 1400 || Math.abs(r.y - cam[1]) > 1400) continue;
        ctx.fillRect(toX(r.x), toY(r.y), r.w * scale, r.h * scale);
      }
    }
    const bl = snap.bullets;
    for (let i = 0; i < bl.length; i += 3) {
      ctx.fillStyle = bl[i + 2] === 1 ? '#39f' : '#ffb04a';
      ctx.beginPath(); ctx.arc(toX(bl[i]), toY(bl[i + 1]), 4 * scale, 0, Math.PI * 2); ctx.fill();
    }
    for (const e of snap.enemies) {
      ctx.fillStyle = KIND_COLOR[e[2]] || '#e55';
      ctx.beginPath(); ctx.arc(toX(e[0]), toY(e[1]), (KIND_SIZE[e[2]] || 16) * scale, 0, Math.PI * 2); ctx.fill();
    }
    if (snap.boss) {
      const b = snap.boss;
      ctx.fillStyle = '#c22';
      ctx.beginPath(); ctx.arc(toX(b[0]), toY(b[1]), b[4] * scale, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#300'; ctx.fillRect(w * 0.25, 20, w * 0.5, 16);
      ctx.fillStyle = '#f55'; ctx.fillRect(w * 0.25, 20, w * 0.5 * b[2], 16);
      ctx.fillStyle = '#fee'; ctx.font = '16px monospace'; ctx.textAlign = 'center'; ctx.fillText(b[3], w * 0.5, 50);
    }
    for (const p of snap.players) {
      ctx.fillStyle = '#3cf';
      ctx.beginPath(); ctx.arc(toX(p[0]), toY(p[1]), 14 * scale, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#eee'; ctx.lineWidth = 3 * scale; ctx.beginPath();
      ctx.moveTo(toX(p[0]), toY(p[1]));
      ctx.lineTo(toX(p[0] + Math.cos(p[4]) * 22), toY(p[1] + Math.sin(p[4]) * 22)); ctx.stroke();
      ctx.fillStyle = '#300'; ctx.fillRect(toX(p[0]) - 20, toY(p[1]) - 28, 40, 5);
      ctx.fillStyle = '#5f5'; ctx.fillRect(toX(p[0]) - 20, toY(p[1]) - 28, 40 * (p[2] / p[3]), 5);
    }
  }

  // ---- DOM renderer ----------------------------------------------------
  _makeDomRenderer() {
    const self = this;
    return {
      world: null, wallLayer: null, entityLayer: null, bulletLayer: null,
      enemyEls: [], bulletEls: [], playerEls: [], bossEl: null,
      wallEls: new Map(), wallPool: [], needWalls: true,

      _ensure() {
        if (this.world) return;
        if (!document.getElementById('spec-dom-style')) {
          const s = document.createElement('style'); s.id = 'spec-dom-style';
          s.textContent = `
            #spec-world { position:absolute; left:0; top:0; will-change:transform; transform-origin:0 0; }
            #spec-world > div { position:absolute; left:0; top:0; }
            .spec-wall { background:#232a44; }
            .spec-ent { border-radius:50%; will-change:transform; }
            .spec-bullet { width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:#ffb04a; }
            .spec-bullet.enemy { background:#39f; }
            .spec-player { width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;
              background:radial-gradient(circle at 40% 35%,#dff,#3cf 55%,#06a 100%); }
            .spec-standard { width:32px;height:32px;margin:-16px 0 0 -16px;background:#e55; }
            .spec-tank { width:52px;height:52px;margin:-26px 0 0 -26px;border-radius:10px;background:#7a6; }
            .spec-swarmer { width:22px;height:22px;margin:-11px 0 0 -11px;background:#fa0; }
          `;
          document.head.appendChild(s);
        }
        this.world = document.createElement('div'); this.world.id = 'spec-world';
        this.wallLayer = document.createElement('div');
        this.entityLayer = document.createElement('div');
        this.bulletLayer = document.createElement('div');
        this.world.append(this.wallLayer, this.bulletLayer, this.entityLayer);
        self.stage.appendChild(this.world);
      },
      show() { this._ensure(); this.world.style.display = ''; },
      hide() { if (this.world) this.world.style.display = 'none'; },

      draw(w, h) {
        this._ensure();
        const snap = self.snap;
        if (!snap) return;
        const cam = snap.cam;
        const { scale, ox, oy } = self._view(w, h, cam);
        this.world.style.transform = `translate3d(${ox}px, ${oy}px, 0) scale(${scale})`;
        this._walls(cam);
        this._pool(this.bulletEls, snap.bullets.length / 3, this.bulletLayer, 'spec-bullet', (el, i) => {
          const bi = i * 3;
          el.className = 'spec-bullet' + (snap.bullets[bi + 2] === 1 ? ' enemy' : '');
          el.style.transform = `translate3d(${snap.bullets[bi]}px, ${snap.bullets[bi + 1]}px, 0)`;
        });
        this._pool(this.enemyEls, snap.enemies.length, this.entityLayer, 'spec-ent', (el, i) => {
          const e = snap.enemies[i];
          el.className = 'spec-ent spec-' + e[2];
          el.style.transform = `translate3d(${e[0]}px, ${e[1]}px, 0)`;
        });
        this._pool(this.playerEls, snap.players.length, this.entityLayer, 'spec-player', (el, i) => {
          const p = snap.players[i];
          el.className = 'spec-player';
          el.style.transform = `translate3d(${p[0]}px, ${p[1]}px, 0)`;
        });
        if (snap.boss) {
          if (!this.bossEl) { this.bossEl = document.createElement('div'); this.entityLayer.appendChild(this.bossEl); }
          const b = snap.boss, d = b[4] * 2;
          this.bossEl.style.display = '';
          this.bossEl.className = 'spec-ent';
          this.bossEl.style.width = d + 'px'; this.bossEl.style.height = d + 'px';
          this.bossEl.style.margin = -b[4] + 'px 0 0 ' + (-b[4]) + 'px';
          this.bossEl.style.background = '#c22';
          this.bossEl.style.transform = `translate3d(${b[0]}px, ${b[1]}px, 0)`;
        } else if (this.bossEl) { this.bossEl.style.display = 'none'; }
      },

      _walls(cam) {
        if (!self.dungeon) return;
        const r = 1300;
        for (const [idx, el] of this.wallEls) {
          const rect = self.dungeon.wallRects[idx];
          if (Math.abs(rect.x - cam[0]) > r || Math.abs(rect.y - cam[1]) > r) {
            el.style.display = 'none'; this.wallPool.push(el); this.wallEls.delete(idx);
          }
        }
        for (let i = 0; i < self.dungeon.wallRects.length; i++) {
          if (this.wallEls.has(i)) continue;
          const rect = self.dungeon.wallRects[i];
          if (Math.abs(rect.x - cam[0]) > r || Math.abs(rect.y - cam[1]) > r) continue;
          let el = this.wallPool.pop();
          if (!el) { el = document.createElement('div'); this.wallLayer.appendChild(el); }
          el.className = 'spec-wall'; el.style.display = '';
          el.style.width = rect.w + 'px'; el.style.height = rect.h + 'px';
          el.style.transform = `translate3d(${rect.x}px, ${rect.y}px, 0)`;
          this.wallEls.set(i, el);
        }
      },

      _pool(arr, count, layer, cls, apply) {
        count = Math.floor(count);
        while (arr.length < count) { const el = document.createElement('div'); el.className = cls; layer.appendChild(el); arr.push(el); }
        for (let i = 0; i < arr.length; i++) {
          if (i < count) { arr[i].style.display = ''; apply(arr[i], i); }
          else if (arr[i].style.display !== 'none') arr[i].style.display = 'none';
        }
      },
    };
  }
}
