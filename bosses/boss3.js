// bosses/boss3.js
// Boss 3: "The Warden" — the hardest fight. It combines and escalates prior
// mechanics across three phases.
//
// Design (documented in README):
//   Phase 1 (>66% HP): steady expanding rings (from Boss 2) while keeping range.
//   Phase 2 (66%-33% HP): rings continue and the Warden periodically SPAWNS adds
//     (swarmers) to split the player's attention (from Boss 1 / swarmer group).
//   Phase 3 (<33% HP): adds the signature CHARGE — a telegraphed dash straight
//     at the player that deals heavy contact damage, layered over rings + adds.
// Fully configurable via CONFIG.bosses.boss3.

import { CONFIG } from '../config.js';
import { Boss, ENEMY_BASE_CSS } from './boss.js';

export class Boss3 extends Boss {
  static styleId = 'bh-boss3';
  static css = `
    bh-boss3 {
      ${ENEMY_BASE_CSS}
      width: 100px; height: 100px; margin: -50px 0 0 -50px;
      border-radius: 24px;
      background: radial-gradient(circle at 36% 30%, #fee, #c22 45%, #600 100%);
      box-shadow: 0 0 26px rgba(255,60,60,0.7), inset 0 0 20px rgba(0,0,0,0.6);
    }
    bh-boss3.telegraph { box-shadow: 0 0 40px 10px rgba(255,255,120,0.9); }
    bh-boss3.charging  { box-shadow: 0 0 40px 14px rgba(255,120,40,0.95); }
  `;

  constructor() {
    super();
    this.kind = 'boss3';
    this.name = 'The Warden';
    this._charge = null; // {state, timer, dir}
  }
  connectedCallback() { this.constructor.ensureStyles(); }

  reset() {
    this.configure(CONFIG.bosses.boss3);
    this._charge = null;
    this._timers = {};
  }

  onThink(dt, game, target) {
    const b = this.stats;
    this.phase = this.phaseFromThresholds([b.phase2HpFrac, b.phase3HpFrac]);

    // Rings in every phase.
    this.everyT('ring', 1 / b.ringFireRate, dt, () => {
      this.fireRing(game, b.ringCount, b.ringSpeed, b.ringDamage, performance.now() * 0.001, 6);
    });

    // Phase 2+: spawn adds.
    if (this.phase >= 2) {
      this.everyT('adds', b.addsEvery, dt, () => {
        for (let i = 0; i < b.addsCount; i++) {
          const a = (i / b.addsCount) * Math.PI * 2;
          game.spawnEnemy('swarmer', this.x + Math.cos(a) * 60, this.y + Math.sin(a) * 60);
        }
      });
    }

    // Phase 3: charge/dash attack layered on top.
    if (this.phase >= 3) {
      this._updateCharge(dt, game, target, b);
      if (this._charge && this._charge.state !== 'idle') { this.applyTransform(); return; }
    }

    // Default movement: keep medium range.
    const dist = Math.hypot(target.x - this.x, target.y - this.y);
    if (dist > 360) this.moveToward(game.dungeon, target.x, target.y, this.speed * dt);
    this.applyTransform();
  }

  _updateCharge(dt, game, target, b) {
    if (!this._charge) this._charge = { state: 'idle', timer: b.chargeEvery, dir: { x: 0, y: 0 } };
    const c = this._charge;
    c.timer -= dt;
    if (c.state === 'idle') {
      this.classList.remove('telegraph', 'charging');
      if (c.timer <= 0) {
        c.state = 'telegraph';
        c.timer = b.chargeTelegraph;
        const d = Math.hypot(target.x - this.x, target.y - this.y) || 1;
        c.dir = { x: (target.x - this.x) / d, y: (target.y - this.y) / d };
        this.classList.add('telegraph');
      }
    } else if (c.state === 'telegraph') {
      if (c.timer <= 0) { c.state = 'charge'; c.timer = 0.45; this.classList.remove('telegraph'); this.classList.add('charging'); }
    } else if (c.state === 'charge') {
      // Rush along the locked direction; damage on contact handled by collision.
      this.moveToward(game.dungeon, this.x + c.dir.x * 1000, this.y + c.dir.y * 1000, b.chargeSpeed * dt);
      // Temporarily raise contact damage during the charge.
      this.contactDamage = b.chargeDamage;
      if (c.timer <= 0) { c.state = 'idle'; c.timer = b.chargeEvery; this.classList.remove('charging'); this.contactDamage = this.stats.contactDamage; }
      c.timer -= dt;
    }
  }
}
customElements.define('bh-boss3', Boss3);
