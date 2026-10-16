// projectiles/bullet.js
// <bh-bullet> custom element + the BulletSystem that pools, updates, and renders
// bullets. Bullets are the main throughput stress, so this file also owns the
// render-target test (render.bulletTarget: 'dom' | 'svg' | 'canvas').
//
//   - 'dom'   : each bullet is its own <bh-bullet> element positioned by
//               transform. This is the architecture under test and the only
//               mode where gBCR collision applies to bullets.
//   - 'svg'   : all bullets drawn as <circle> nodes in one shared <svg>.
//   - 'canvas': all bullets drawn on one <canvas> layer (control).
//
// In svg/canvas modes bullets have no per-bullet element, so the collision
// system falls back to math narrow-phase for them (documented in README).

import { CONFIG } from '../config.js';
import { Entity } from '../core/entity.js';
import { Pool } from '../core/pool.js';
import { TILE } from '../world/dungeon.js';

export class Bullet extends Entity {
  static styleId = 'bh-bullet';
  static css = `
    bh-bullet {
      position: absolute;
      left: 0; top: 0;
      width: 10px; height: 10px;
      margin: -5px 0 0 -5px;            /* center on transform origin */
      border-radius: 50%;
      background: radial-gradient(circle at 40% 35%, #fff, #ffd86b 40%, #ff7b3a 75%, #a33 100%);
      box-shadow: 0 0 6px 1px rgba(255,170,70,0.8);
      pointer-events: none;
      /* NOTE: no will-change on bullets (short-lived, many of them). */
    }
    bh-bullet.enemy {
      background: radial-gradient(circle at 40% 35%, #fff, #8ff 40%, #39f 75%, #114 100%);
      box-shadow: 0 0 6px 1px rgba(90,170,255,0.8);
    }
  `;

  constructor() {
    super();
    this.vx = 0; this.vy = 0;
    this.life = 1;
    this.damage = 1;
    this.pierceLeft = 0;
    this.owner = null;
    this.radius = 5;
    this.isBullet = true;
    this._hitSet = null;
  }

  connectedCallback() { this.constructor.ensureStyles(); }

  init(x, y, vx, vy, opts) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.life = opts.life;
    this.damage = opts.damage;
    this.radius = opts.radius;
    this.pierceLeft = opts.pierce || 0;
    this.owner = opts.owner;
    this.faction = opts.faction;
    this.dead = false;
    this.alive = true;
    this.simTier = 'active';
    this._hitSet = null;
    this._lastTransform = '';
    this.className = this.faction === 'enemy' ? 'enemy' : '';
  }

  reset() {
    this.dead = true; this.alive = false; this.owner = null; this._hitSet = null;
  }

  update(dt, game) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) { this.kill(); return; }
    // Wall collision via tile lookup (cheap, deterministic, no tunneling at
    // tile granularity). Optional swept check handled in BulletSystem.
    const d = game.dungeon;
    const tx = (this.x / d.ts) | 0, ty = (this.y / d.ts) | 0;
    if (d.tileAt(tx, ty) === TILE.WALL) { this.kill(); }
  }
}
customElements.define('bh-bullet', Bullet);

// ---------------------------------------------------------------------------

export class BulletSystem {
  constructor(game) {
    this.game = game;
    this.list = [];                 // live Bullet objects (game.bullets)
    this.pool = new Pool('bh-bullet', game.bulletLayer);
    this.pool.prewarm(CONFIG.pool.bulletInitial);
    this._svg = null;
    this._canvas = null;
    this._ctx = null;
    this._renderMode = CONFIG.render.bulletTarget;
  }

  spawn(x, y, dir, speed, opts) {
    if (this.list.length >= CONFIG.pool.maxBulletsAlive) return null;
    const b = this.pool.acquire();
    b.init(x, y, Math.cos(dir) * speed, Math.sin(dir) * speed, opts);
    if (this._renderMode === 'dom') {
      this.game.bulletLayer.appendChild(b);
      b.style.display = '';
      b.applyTransform();
    }
    this.list.push(b);
    return b;
  }

  // Convenience for a bullet with explicit velocity vector.
  spawnVel(x, y, vx, vy, opts) {
    const speed = Math.hypot(vx, vy) || 1;
    return this.spawn(x, y, Math.atan2(vy, vx), speed, opts);
  }

  update(dt) {
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.dead) continue;
      if (b.simTier === 'dormant') continue; // far bullets paused
      b.update(dt, this.game);
    }
    // Compact: remove dead and release to pool.
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.dead) { this.pool.release(b); continue; }
      list[w++] = b;
    }
    list.length = w;
  }

  // Render per the selected target. Called once per frame after update.
  render() {
    const mode = CONFIG.render.bulletTarget;
    if (mode !== this._renderMode) this._switchMode(mode);
    if (mode === 'dom') {
      for (let i = 0; i < this.list.length; i++) {
        const b = this.list[i];
        if (b.simTier !== 'dormant') b.applyTransform();
      }
    } else if (mode === 'svg') {
      this._renderSvg();
    } else {
      this._renderCanvas();
    }
  }

  _switchMode(mode) {
    // Tear down previous visuals.
    if (this._renderMode === 'dom') {
      for (const b of this.list) b.remove();
    }
    this._renderMode = mode;
    if (mode === 'dom') {
      if (this._svg) this._svg.style.display = 'none';
      if (this._canvas) this._canvas.style.display = 'none';
      for (const b of this.list) { this.game.bulletLayer.appendChild(b); b.style.display = ''; b._lastTransform=''; }
    } else if (mode === 'svg') {
      this._ensureSvg();
      this._svg.style.display = '';
      if (this._canvas) this._canvas.style.display = 'none';
    } else {
      this._ensureCanvas();
      this._canvas.style.display = '';
      if (this._svg) this._svg.style.display = 'none';
    }
  }

  _ensureSvg() {
    if (this._svg) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'bullet-svg-layer');
    svg.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none;';
    this.game.bulletLayer.appendChild(svg);
    this._svg = svg;
  }

  _renderSvg() {
    const svg = this._svg;
    const live = this.list;
    // Reuse child circles; create/remove to match count.
    while (svg.childNodes.length < live.length) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      svg.appendChild(c);
    }
    while (svg.childNodes.length > live.length) svg.removeChild(svg.lastChild);
    for (let i = 0; i < live.length; i++) {
      const b = live[i];
      const c = svg.childNodes[i];
      c.setAttribute('cx', b.x);
      c.setAttribute('cy', b.y);
      c.setAttribute('r', b.radius);
      c.setAttribute('fill', b.faction === 'enemy' ? '#39f' : '#ffb04a');
    }
  }

  _ensureCanvas() {
    if (this._canvas) return;
    const c = document.createElement('canvas');
    c.className = 'bullet-canvas-layer';
    c.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;';
    this.game.bulletLayer.appendChild(c);
    this._canvas = c;
    this._ctx = c.getContext('2d');
  }

  _renderCanvas() {
    // Canvas sits on the moving world layer, so world coords map directly, but
    // it must be sized to cover the visible world region around the camera.
    const cam = this.game.camera;
    const ctx = this._ctx;
    const w = cam.viewW, h = cam.viewH;
    if (this._canvas.width !== w) this._canvas.width = w;
    if (this._canvas.height !== h) this._canvas.height = h;
    // Draw in screen space: translate world->screen via camera offset.
    const ox = this.game.bulletLayer === this.game.world ? 0 : 0;
    this._canvas.style.transform = `translate3d(${cam.x - w / 2}px, ${cam.y - h / 2}px, 0)`;
    ctx.clearRect(0, 0, w, h);
    const bx = cam.x - w / 2, by = cam.y - h / 2;
    for (let i = 0; i < this.list.length; i++) {
      const b = this.list[i];
      ctx.beginPath();
      ctx.fillStyle = b.faction === 'enemy' ? '#39f' : '#ffb04a';
      ctx.arc(b.x - bx, b.y - by, b.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  get aliveCount() { return this.list.length; }

  clear() {
    for (const b of this.list) { b.kill(); this.pool.release(b); }
    this.list.length = 0;
    if (this._svg) while (this._svg.firstChild) this._svg.removeChild(this._svg.firstChild);
  }
}
