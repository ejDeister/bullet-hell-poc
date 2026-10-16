// player/player.js
// <bh-player>: movement, stamina, sprint, dash, weapon inventory, item slots.
// Uses transform-only motion and tile-based wall collision with axis sliding.
// will-change: transform is set here because the player is long-lived.

import { CONFIG } from '../config.js';
import { Entity } from '../core/entity.js';
import { Stamina } from './stamina.js';
import { TILE } from '../world/dungeon.js';
import { Pistol } from '../weapons/pistol.js';
import { Smg } from '../weapons/smg.js';
import { Shotgun } from '../weapons/shotgun.js';
import { Sniper } from '../weapons/sniper.js';

const WEAPON_CLASSES = { pistol: Pistol, smg: Smg, shotgun: Shotgun, sniper: Sniper };

export class Player extends Entity {
  static styleId = 'bh-player';
  static css = `
    bh-player {
      position: absolute; left: 0; top: 0;
      width: 28px; height: 28px; margin: -14px 0 0 -14px;
      border-radius: 50%;
      background: radial-gradient(circle at 40% 35%, #dff, #3cf 55%, #06a 100%);
      box-shadow: 0 0 10px rgba(60,200,255,0.7);
      will-change: transform;
      pointer-events: none;
      z-index: 5;
    }
    bh-player::after {
      content: ''; position: absolute; left: 50%; top: 50%;
      width: 18px; height: 4px; margin-top: -2px;
      background: #eee; border-radius: 2px;
      transform-origin: 0 50%;
      transform: rotate(var(--aim, 0rad));
    }
    bh-player.hurt { animation: bh-hurt 0.25s; }
    bh-player.invuln { opacity: 0.55; }
    @keyframes bh-hurt { 0%,100%{filter:none;} 50%{filter:brightness(2.2) saturate(0.2);} }
  `;

  constructor() {
    super();
    this.faction = 'player';
    this.radius = CONFIG.player.radius;
    this.maxHp = CONFIG.player.maxHp;
    this.hp = this.maxHp;
    this.stamina = new Stamina();
    this.weapons = [];
    this.weaponIndex = 0;
    this.items = [];            // [{id, count}]
    this.itemIndex = 0;
    this.aim = 0;
    this.invuln = 0;            // seconds of i-frames remaining
    this._dashTime = 0;
    this._dashCd = 0;
    this._dashDir = { x: 0, y: 0 };
    this.speedMult = 1;        // from speed elixir
    this.isLocal = true;       // false for remote networked players
  }

  connectedCallback() { this.constructor.ensureStyles(); }

  setup(game) {
    this.game = game;
    this.giveWeapon(CONFIG.player.startWeapon);
    for (const id of CONFIG.items.startItems.slice(0, CONFIG.items.slots)) {
      this.items.push({ id, count: 3 });
    }
  }

  giveWeapon(id) {
    if (this.weapons.find(w => w.id === id)) return;
    const Cls = WEAPON_CLASSES[id];
    if (!Cls) return;
    this.weapons.push(new Cls());
    this.weaponIndex = this.weapons.length - 1; // auto-equip new gun
  }

  get weapon() { return this.weapons[this.weaponIndex]; }
  get activeItem() { return this.items[this.itemIndex]; }

  // ---- update ----------------------------------------------------------
  update(dt, game) {
    const inp = game.input;
    if (this.isLocal) this._handleInput(dt, game, inp);
    this.stamina.update(dt);
    if (this.invuln > 0) this.invuln -= dt;
    if (this._dashCd > 0) this._dashCd -= dt;
    this.weapon && this.weapon.tick(dt);
    this.classList.toggle('invuln', this.invuln > 0);
    this.style.setProperty('--aim', this.aim + 'rad');
  }

  _handleInput(dt, game, inp) {
    // Aim from player screen pos to mouse.
    const s = game.camera.worldToScreen(this.x, this.y);
    this.aim = Math.atan2(inp.mouse.y - s.y, inp.mouse.x - s.x);

    // Weapon switch: number keys 1..4 pick owned weapons by order.
    for (let i = 1; i <= 4; i++) {
      if (inp.pressed(String(i)) && this.weapons[i - 1]) this.weaponIndex = i - 1;
    }
    // Item cycle Q/E, use F.
    if (inp.pressed('q')) this._cycleItem(-1);
    if (inp.pressed('e')) this._cycleItem(1);
    if (inp.pressed('f')) this._useItem(game);

    // Dash (Space).
    if (inp.pressed(' ') && this._dashCd <= 0 && this.stamina.canDash() && this._dashTime <= 0) {
      const mv = inp.moveVector();
      let dx = mv.x, dy = mv.y;
      if (dx === 0 && dy === 0) { dx = Math.cos(this.aim); dy = Math.sin(this.aim); }
      this._dashDir = { x: dx, y: dy };
      this._dashTime = CONFIG.stamina.dashDuration;
      this._dashCd = CONFIG.stamina.dashCooldown;
      this.stamina.spendDash();
      game.audio.dash();
      if (CONFIG.stamina.dashIFrames) this.invuln = Math.max(this.invuln, CONFIG.stamina.dashDuration + 0.05);
    }

    // Movement.
    let speed, vx, vy;
    if (this._dashTime > 0) {
      // Dash ignores weapon penalty.
      this._dashTime -= dt;
      speed = CONFIG.stamina.dashSpeed;
      vx = this._dashDir.x * speed;
      vy = this._dashDir.y * speed;
    } else {
      const mv = inp.moveVector();
      const moving = mv.x !== 0 || mv.y !== 0;
      let base = CONFIG.player.baseSpeed * this.speedMult;
      const penalty = this.weapon ? this.weapon.speedPenalty : 0;
      base *= (1 - penalty);
      const sprint = inp.has('shift') && moving && this.stamina.canSprint();
      if (sprint) { base *= CONFIG.stamina.sprintMultiplier; this.stamina.drainSprint(dt); }
      vx = mv.x * base;
      vy = mv.y * base;
    }
    this._moveWithWalls(game.dungeon, vx * dt, vy * dt);

    // Firing. Automatic weapons fire while held; others fire once per press
    // (the weapon fire rate still gates the cadence via its cooldown).
    const w = this.weapon;
    if (w) {
      if (inp.mouse.down) {
        if (w.auto || !inp._fireLatch) w.fire(game, this, this.aim);
        inp._fireLatch = true;
      } else {
        inp._fireLatch = false;
      }
      // Sniper laser sight follows the aim; hide it for other weapons.
      if (w.hasLaser) w.updateSight(game, this, this.aim);
      else if (game.hideLasers) game.hideLasers();
    }
  }

  _cycleItem(dir) {
    if (!this.items.length) return;
    this.itemIndex = (this.itemIndex + dir + this.items.length) % this.items.length;
  }

  _useItem(game) {
    const slot = this.activeItem;
    if (!slot || slot.count <= 0) return;
    if (game.useItem(this, slot.id)) {
      slot.count--;
    }
  }

  // Axis-separated tile collision so the player slides along walls.
  _moveWithWalls(d, dx, dy) {
    const r = this.radius;
    if (!this._wallAt(d, this.x + dx, this.y, r)) this.x += dx;
    if (!this._wallAt(d, this.x, this.y + dy, r)) this.y += dy;
  }

  _wallAt(d, x, y, r) {
    // Sample the circle's bounding box corners + center.
    const pts = [
      [x - r, y - r], [x + r, y - r], [x - r, y + r], [x + r, y + r], [x, y],
    ];
    for (let i = 0; i < pts.length; i++) {
      const tx = (pts[i][0] / d.ts) | 0, ty = (pts[i][1] / d.ts) | 0;
      if (d.tileAt(tx, ty) === TILE.WALL) return true;
    }
    return false;
  }

  // ---- damage ----------------------------------------------------------
  takeContact(amount, source) {
    if (this.invuln > 0 || CONFIG.debug.godMode) return;
    this.hp -= amount;
    this.invuln = CONFIG.player.contactIFrames;
    this.game.audio.hurt();
    this._flashHurt();
    if (this.hp <= 0) this.game.onPlayerDeath(this);
  }

  damage(amount, source) {
    if (this.invuln > 0 || CONFIG.debug.godMode) return false;
    this.hp -= amount;
    this.game.audio.hurt();
    this._flashHurt();
    if (this.hp <= 0) { this.game.onPlayerDeath(this); return true; }
    return false;
  }

  heal(amount) { this.hp = Math.min(this.maxHp, this.hp + amount); }

  _flashHurt() {
    this.classList.remove('hurt');
    void this.offsetWidth; // restart animation
    this.classList.add('hurt');
  }
}
customElements.define('bh-player', Player);
