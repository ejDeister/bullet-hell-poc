// bosses/boss.js
// Base Boss class (extends Enemy). Adds phase tracking by HP fraction, a named
// attack-timer helper, and death handling that advances the campaign.

import { Enemy, ENEMY_BASE_CSS } from '../enemies/enemy.js';

export class Boss extends Enemy {
  constructor() {
    super();
    this.isBoss = true;
    this.phase = 1;
    this._timers = {};
  }

  get hpFrac() { return this.hp / this.maxHp; }

  // Return the phase index given descending HP-fraction thresholds.
  // phaseFromThresholds([0.66, 0.33]) -> 1 above .66, 2 in (.33,.66], 3 below.
  phaseFromThresholds(thresholds) {
    let phase = 1;
    for (let i = 0; i < thresholds.length; i++) {
      if (this.hpFrac <= thresholds[i]) phase = i + 2;
    }
    return phase;
  }

  // Fire callback once every `period` seconds for the named timer.
  everyT(name, period, dt, cb) {
    this._timers[name] = (this._timers[name] || 0) - dt;
    if (this._timers[name] <= 0) {
      this._timers[name] = period;
      cb();
    }
  }

  // Ring of bullets around the boss.
  fireRing(game, count, speed, damage, angleOffset = 0, radius = 6) {
    for (let i = 0; i < count; i++) {
      const a = angleOffset + (i / count) * Math.PI * 2;
      game.bullets.spawn(this.x, this.y, a, speed, {
        life: 4, damage, radius, pierce: 0, owner: this, faction: 'enemy',
      });
    }
  }

  onDeath(source) {
    this.kill();
    this.remove();
    if (this.game) this.game.onBossDefeated(this);
  }
}

export { ENEMY_BASE_CSS };
