// core/entity.js
// Base Entity custom element. Treat the DOM element as the game object.
//
// Architecture rules honored here:
//  - Entities ARE custom elements extending HTMLElement (no Shadow DOM).
//  - Game state lives in dataset; typed getters/setters wrap the string storage.
//  - Positioning/animation use CSS transform only (translate/rotate/scale).
//  - Dataset writes are governed by render.datasetWriteMode to measure the cost.

import { CONFIG } from '../config.js';

// Tracks which element classes have already injected their <style> once.
const _stylesInjected = new Set();

export class Entity extends HTMLElement {
  constructor() {
    super();
    // Hot logical state kept in JS fields (fast). Dataset is synced per the
    // datasetWriteMode so we can measure dataset-write cost separately.
    this.x = 0;              // world position (px)
    this.y = 0;
    this.rot = 0;            // radians, visual rotation
    this.scale = 1;
    this.radius = 8;         // collision radius (circle broad model)
    this.hp = 1;
    this.maxHp = 1;
    this.faction = 'neutral';// 'player' | 'enemy' | 'neutral'
    this.dead = false;
    this.alive = false;      // true while attached and simulated
    this.simTier = 'active'; // 'active' | 'near' | 'dormant'
    this._lastTransform = ''; // dedupe transform writes
    this._datasetDirty = {}; // pending lazy dataset writes
  }

  // Inject the class stylesheet exactly once. Subclasses call
  // this.constructor.ensureStyles() in connectedCallback.
  static ensureStyles() {
    const name = this.styleId || this.name;
    if (_stylesInjected.has(name)) return;
    if (!this.css) return;
    const style = document.createElement('style');
    style.dataset.for = name;
    style.textContent = this.css;
    document.head.appendChild(style);
    _stylesInjected.add(name);
  }

  // ---- dataset-backed typed accessors ----------------------------------
  // Strings in dataset, typed in JS. Use setState for governed writes.
  setState(key, value) {
    const mode = CONFIG.render.datasetWriteMode;
    if (mode === 'lazy') {
      this._datasetDirty[key] = value;
      return;
    }
    // onChange and everyFrame both write immediately here; the per-frame
    // forced writes are driven by syncDataset() below.
    if (this.dataset[key] !== String(value)) {
      this.dataset[key] = value;
    }
  }

  getState(key, fallback = null) {
    const v = this.dataset[key];
    return v === undefined ? fallback : v;
  }

  getNum(key, fallback = 0) {
    const v = this.dataset[key];
    return v === undefined ? fallback : parseFloat(v);
  }

  // Flush lazy dataset writes (called by game loop once per frame for lazy mode).
  flushDataset() {
    if (CONFIG.render.datasetWriteMode !== 'lazy') return;
    for (const k in this._datasetDirty) {
      this.dataset[k] = this._datasetDirty[k];
      delete this._datasetDirty[k];
    }
  }

  // everyFrame mode: forcibly re-write the hot props each frame to measure cost.
  syncDataset() {
    if (CONFIG.render.datasetWriteMode !== 'everyFrame') return;
    this.dataset.hp = String(this.hp | 0);
    this.dataset.x = String(this.x | 0);
    this.dataset.y = String(this.y | 0);
  }

  // ---- transform -------------------------------------------------------
  // Single transform write per frame. Positions are in world space; the
  // camera is a parent transform on the world container, so children use
  // world coordinates directly.
  applyTransform() {
    let t;
    if (this.rot !== 0 || this.scale !== 1) {
      t = `translate3d(${this.x}px, ${this.y}px, 0) rotate(${this.rot}rad) scale(${this.scale})`;
    } else {
      t = `translate3d(${this.x}px, ${this.y}px, 0)`;
    }
    if (t !== this._lastTransform) {
      this.style.transform = t;
      this._lastTransform = t;
    }
  }

  // ---- lifecycle --------------------------------------------------------
  // Called by the game when the entity is activated (from pool or fresh).
  activate(x, y) {
    this.x = x;
    this.y = y;
    this.dead = false;
    this.alive = true;
    this.simTier = 'active';
    this.style.display = '';
    this._lastTransform = '';
    this.applyTransform();
  }

  // Marks the entity dead. The game/pool removes or recycles it.
  kill() {
    this.dead = true;
    this.alive = false;
  }

  // Damage helper. Returns true if this killed the entity.
  damage(amount, source = null) {
    if (this.dead) return false;
    this.hp -= amount;
    if (CONFIG.render.datasetWriteMode !== 'everyFrame') this.setState('hp', this.hp | 0);
    if (this.hp <= 0) {
      this.onDeath(source);
      return true;
    }
    this.onHit(amount, source);
    return false;
  }

  // Hooks for subclasses.
  onHit(amount, source) {}
  onDeath(source) { this.kill(); }

  // Per-frame update. dt in seconds. Subclasses override.
  update(dt, game) {}
}
