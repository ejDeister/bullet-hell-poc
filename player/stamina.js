// player/stamina.js
// Stamina model: drains on sprint, spent in chunks on dash, regenerates after a
// short delay once idle from stamina use.

import { CONFIG } from '../config.js';

export class Stamina {
  constructor() {
    this.max = CONFIG.stamina.max;
    this.value = this.max;
    this._regenBlock = 0; // seconds before regen resumes
  }

  get frac() { return this.value / this.max; }

  canSprint() { return this.value > 1; }
  canDash() { return this.value >= CONFIG.stamina.dashCost; }

  drainSprint(dt) {
    this.value = Math.max(0, this.value - CONFIG.stamina.sprintDrainPerSec * dt);
    this._regenBlock = CONFIG.stamina.regenDelay;
  }

  spendDash() {
    this.value = Math.max(0, this.value - CONFIG.stamina.dashCost);
    this._regenBlock = CONFIG.stamina.regenDelay;
  }

  update(dt) {
    if (this._regenBlock > 0) { this._regenBlock -= dt; return; }
    if (this.value < this.max) {
      this.value = Math.min(this.max, this.value + CONFIG.stamina.regenPerSec * dt);
    }
  }
}
