// net/receiver.js
// The spectator receiver. It runs on the TV (the Presentation receiver page).
//
// Signaling: it reads the PresentationConnection, decodes the base64 offer,
// creates a base64 answer, and sends it back over the same connection. Then it
// opens the WebRTC data channel and renders the streamed game state.
//
// Two render paths exist for comparison, chosen by the host (config.cast.
// receiverRender) and switchable live:
//   - 'canvas': one canvas, draws everything each frame (cheap on weak devices).
//   - 'dom'   : the host architecture on the TV — a camera transform on a world
//               container, with pooled DOM elements positioned by transform.
// Press R on the receiver to toggle the path locally for a quick comparison.
//
// Either path reuses the PerfOverlay to show the FPS counter and the graph from
// the streamed perf data.

import { CONFIG } from '../config.js';
import { Dungeon } from '../world/dungeon.js';
import { PerfOverlay } from '../ui/perf-overlay.js';

const b64encode = (str) => btoa(unescape(encodeURIComponent(str)));
const b64decode = (b64) => decodeURIComponent(escape(atob(b64)));

const statusEl = document.getElementById('status');
const bannerEl = document.getElementById('banner');
const scoreEl = document.getElementById('score');
const stage = document.getElementById('stage');
const canvas = document.getElementById('spectator');
const ctx = canvas.getContext('2d');

function setStatus(msg) { statusEl.textContent = msg; statusEl.style.display = msg ? '' : 'none'; }

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resize);
resize();

const perf = new PerfOverlay();
document.body.appendChild(perf);
perf.classList.add('visible');

let dungeon = null;
let snap = null;
let pc = null;
let mode = (new URLSearchParams(location.search).get('render')) || CONFIG.cast.receiverRender || 'canvas';

// Local toggle for testing (TVs usually have no keyboard; the host also sets it).
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'r') setMode(mode === 'canvas' ? 'dom' : 'canvas');
});

// ---- signaling over the presentation connection ------------------------
if (navigator.presentation && navigator.presentation.receiver) {
  navigator.presentation.receiver.connectionList.then((list) => {
    list.connections.forEach(bindConnection);
    list.addEventListener('connectionavailable', (e) => bindConnection(e.connection));
  }).catch((e) => setStatus('Receiver error: ' + e.message));
} else {
  setStatus('Open this page through a cast from the host, not directly.');
}

function bindConnection(conn) {
  setStatus('Host connected. Negotiating WebRTC...');
  conn.addEventListener('message', (e) => onSignal(conn, e.data));
  conn.addEventListener('close', () => setStatus('Host closed the connection.'));
  conn.addEventListener('terminate', () => setStatus('Cast ended.'));
  // Tell the host the TV is listening, so the host sends the offer now. This
  // removes the race where the host sends before the TV page is ready.
  sendReady(conn);
}

function sendReady(conn) {
  const ping = () => { try { conn.send(b64encode(JSON.stringify({ type: 'ready' }))); } catch (e) {} };
  if (conn.state === 'connected' || conn.state === undefined) ping();
  conn.addEventListener('connect', ping);
  // Send a few times in case the first is dropped during connect.
  let n = 0;
  const t = setInterval(() => { ping(); if (++n >= 5) clearInterval(t); }, 400);
}

async function onSignal(conn, data) {
  let msg;
  try { msg = JSON.parse(b64decode(data)); } catch { return; }
  if (msg.type !== 'offer') return;
  const servers = CONFIG.cast.stunServers.length ? [{ urls: CONFIG.cast.stunServers }] : [];
  pc = new RTCPeerConnection({ iceServers: servers });
  pc.ondatachannel = (e) => bindChannel(e.channel);
  await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitIce(pc);
  conn.send(b64encode(JSON.stringify({ type: 'answer', sdp: pc.localDescription.sdp })));
  setStatus('Answer sent. Starting the spectator view...');
}

function waitIce(pc) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const check = () => {
      if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', check); resolve(); }
    };
    pc.addEventListener('icegatheringstatechange', check);
    setTimeout(resolve, 4000);
  });
}

function bindChannel(ch) {
  ch.onmessage = (e) => onGameMessage(e.data);
  ch.onopen = () => setStatus('');
}

function onGameMessage(data) {
  let msg;
  try { msg = JSON.parse(data); } catch { return; }
  if (msg.t === 'init') {
    dungeon = new Dungeon(msg.seed, msg.endless ? 1000 : msg.dungeonIndex);
    if (msg.render) setMode(msg.render);
    domRenderer.needWalls = true;
    setStatus('');
  } else if (msg.t === 'snap') {
    snap = msg;
    if (msg.render && msg.render !== mode) setMode(msg.render);
  }
}

// ---- render-path switch ------------------------------------------------
function setMode(m) {
  if (m === mode) return;
  mode = m;
  if (mode === 'canvas') { canvas.style.display = ''; domRenderer.hide(); }
  else { canvas.style.display = 'none'; domRenderer.show(); domRenderer.needWalls = true; }
  bannerEl.dataset.mode = mode;
}

// ---- shared view transform (world -> screen, fit host viewport) --------
function viewTransform(w, h, cam) {
  const scale = Math.min(w / cam[2], h / cam[3]);
  return { scale, ox: w / 2 - cam[0] * scale, oy: h / 2 - cam[1] * scale };
}

const KIND_COLOR = { standard: '#e55', tank: '#7a6', swarmer: '#fa0' };
const KIND_SIZE = { standard: 16, tank: 26, swarmer: 11 };

// ---- canvas renderer ---------------------------------------------------
const canvasRenderer = {
  draw(w, h) {
    ctx.clearRect(0, 0, w, h);
    if (!snap) return;
    const cam = snap.cam;
    const { scale, ox, oy } = viewTransform(w, h, cam);
    const toX = (x) => x * scale + ox, toY = (y) => y * scale + oy;

    if (dungeon) {
      ctx.fillStyle = '#232a44';
      for (const r of dungeon.wallRects) {
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
    if (snap.boss) drawBossCanvas(w, toX, toY, scale);
    for (const p of snap.players) drawPlayerCanvas(toX, toY, scale, p);
  },
};

function drawBossCanvas(w, toX, toY, scale) {
  const b = snap.boss;
  ctx.fillStyle = '#c22';
  ctx.beginPath(); ctx.arc(toX(b[0]), toY(b[1]), b[4] * scale, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#300'; ctx.fillRect(w * 0.25, 20, w * 0.5, 16);
  ctx.fillStyle = '#f55'; ctx.fillRect(w * 0.25, 20, w * 0.5 * b[2], 16);
  ctx.fillStyle = '#fee'; ctx.font = '16px monospace'; ctx.textAlign = 'center'; ctx.fillText(b[3], w * 0.5, 50);
}
function drawPlayerCanvas(toX, toY, scale, p) {
  ctx.fillStyle = '#3cf';
  ctx.beginPath(); ctx.arc(toX(p[0]), toY(p[1]), 14 * scale, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#eee'; ctx.lineWidth = 3 * scale; ctx.beginPath();
  ctx.moveTo(toX(p[0]), toY(p[1]));
  ctx.lineTo(toX(p[0] + Math.cos(p[4]) * 22), toY(p[1] + Math.sin(p[4]) * 22)); ctx.stroke();
  ctx.fillStyle = '#300'; ctx.fillRect(toX(p[0]) - 20, toY(p[1]) - 28, 40, 5);
  ctx.fillStyle = '#5f5'; ctx.fillRect(toX(p[0]) - 20, toY(p[1]) - 28, 40 * (p[2] / p[3]), 5);
}

// ---- DOM renderer ------------------------------------------------------
// Mirrors the host render path: one camera transform on a world container, with
// pooled elements positioned by transform. This is the comparison target.
const domRenderer = {
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
    stage.appendChild(this.world);
  },
  show() { this._ensure(); this.world.style.display = ''; },
  hide() { if (this.world) this.world.style.display = 'none'; },

  draw(w, h) {
    this._ensure();
    if (!snap) return;
    const cam = snap.cam;
    const { scale, ox, oy } = viewTransform(w, h, cam);
    // One camera transform on the world container (like the host camera).
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
    // Boss: one element, sized by the streamed radius.
    if (snap.boss) {
      if (!this.bossEl) { this.bossEl = document.createElement('div'); this.entityLayer.appendChild(this.bossEl); }
      const b = snap.boss, d = b[4] * 2;
      this.bossEl.style.display = '';
      this.bossEl.className = 'spec-ent';
      this.bossEl.style.width = d + 'px'; this.bossEl.style.height = d + 'px';
      this.bossEl.style.margin = -b[4] + 'px 0 0 ' + (-b[4]) + 'px';
      this.bossEl.style.background = '#c22';
      this.bossEl.style.transform = `translate3d(${b[0]}px, ${b[1]}px, 0)`;
    } else if (this.bossEl) {
      this.bossEl.style.display = 'none';
    }
  },

  _walls(cam) {
    if (!dungeon) return;
    const r = 1300;
    // Hide out-of-range.
    for (const [idx, el] of this.wallEls) {
      const rect = dungeon.wallRects[idx];
      if (Math.abs(rect.x - cam[0]) > r || Math.abs(rect.y - cam[1]) > r) {
        el.style.display = 'none'; this.wallPool.push(el); this.wallEls.delete(idx);
      }
    }
    // Show in-range.
    for (let i = 0; i < dungeon.wallRects.length; i++) {
      if (this.wallEls.has(i)) continue;
      const rect = dungeon.wallRects[i];
      if (Math.abs(rect.x - cam[0]) > r || Math.abs(rect.y - cam[1]) > r) continue;
      let el = this.wallPool.pop();
      if (!el) { el = document.createElement('div'); this.wallLayer.appendChild(el); }
      el.className = 'spec-wall';
      el.style.display = '';
      el.style.width = rect.w + 'px'; el.style.height = rect.h + 'px';
      el.style.transform = `translate3d(${rect.x}px, ${rect.y}px, 0)`;
      this.wallEls.set(i, el);
    }
  },

  // Reuse divs up to `count`; create as needed; hide the extras.
  _pool(arr, count, layer, cls, apply) {
    count = Math.floor(count);
    while (arr.length < count) { const el = document.createElement('div'); el.className = cls; layer.appendChild(el); arr.push(el); }
    for (let i = 0; i < arr.length; i++) {
      if (i < count) { arr[i].style.display = ''; apply(arr[i], i); }
      else if (arr[i].style.display !== 'none') arr[i].style.display = 'none';
    }
  },
};

// ---- main render loop --------------------------------------------------
function render() {
  requestAnimationFrame(render);
  const w = canvas.width, h = canvas.height;
  if (mode === 'canvas') canvasRenderer.draw(w, h);
  else domRenderer.draw(window.innerWidth, window.innerHeight);

  if (snap) {
    bannerEl.textContent = (snap.label || '') + '  [' + mode + ']';
    scoreEl.textContent = 'Score ' + snap.score;
    if (snap.perf) perf.render(makeProf(snap.perf), { render: mode });
  }
}

function makeProf(p) {
  return {
    fps: p.fps,
    maxSamples: p.maxSamples || 120,
    frameTimes: p.frameTimes || [],
    systems: p.systems || {},
    counters: p.counters || {},
    stats: () => p.stats || { avg: 0, p95: 0, max: 0 },
  };
}

requestAnimationFrame(render);
