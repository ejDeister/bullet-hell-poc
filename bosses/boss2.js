// bosses/boss2.js
// Boss 2: "The Carousel" — a fast-moving boss built around bullet-ring and
// spiral patterns (a classic bullet-hell dial).
//
// Design (documented in README):
//   Phase 1 (>50% HP): orbits the player and fires expanding rings on a slow
//     cadence. Readable, teaches the dodge rhythm.
//   Phase 2 (<=50% HP): keeps the rings and ADDS two rotating spiral arms that
//     sweep continuously, forcing constant motion. Move speed is unchanged, so
//     the pressure comes from pattern density, not raw speed.
// Fully configurable via CONFIG.bosses.boss2.

import { CONFIG } from '../config.js';
import { Boss, ENEMY_BASE_CSS } from './boss.js';

export class Boss2 extends Boss {
  static styleId = 'bh-boss2';
  static css = `
    bh-boss2 {
      ${ENEMY_BASE_CSS}
      width: 80px; height: 80px; margin: -40px 0 0 -40px;
      background: conic-gradient(from 0deg, #8ff, #39f, #93f, #39f, #8ff);
      box-shadow: 0 0 20px rgba(80,160,255,0.7);
    }
  `;

  constructor() {
    super();
    this.kind = 'boss2';
    this.name = 'The Carousel';
    this._spiralAngle = 0;
    this._orbit = 0;
  }
  connectedCallback() { this.constructor.ensureStyles(); }

  reset() { this.configure(CONFIG.bosses.boss2); this._spiralAngle = 0; this._orbit = 0; }

  onThink(dt, game, target) {
    const b = this.stats;
    this.phase = this.hpFrac <= b.phase2HpFrac ? 2 : 1;

    // Orbit the target at a set radius for constant repositioning.
    this._orbit += dt * (this.phase === 2 ? 1.6 : 1.0);
    const ringR = 320;
    const ox = target.x + Math.cos(this._orbit) * ringR;
    const oy = target.y + Math.sin(this._orbit) * ringR;
    this.moveToward(game.dungeon, ox, oy, this.speed * dt);

    // Rings (both phases).
    this.everyT('ring', 1 / b.ringFireRate, dt, () => {
      this.fireRing(game, b.ringCount, b.ringSpeed, b.ringDamage, this._orbit, 6);
    });

    // Spirals (phase 2 only): several arms rotating together.
    if (this.phase === 2) {
      this.everyT('spiral', 1 / b.spiralFireRate, dt, () => {
        this._spiralAngle += b.spiralRotSpeed * (1 / b.spiralFireRate);
        for (let arm = 0; arm < b.spiralCount; arm++) {
          const a = this._spiralAngle + (arm / b.spiralCount) * Math.PI * 2;
          game.bullets.spawn(this.x, this.y, a, b.spiralSpeed, {
            life: 4, damage: b.spiralDamage, radius: 5, pierce: 0, owner: this, faction: 'enemy',
          });
        }
      });
    }
    this.applyTransform();
  }
}
customElements.define('bh-boss2', Boss2);
