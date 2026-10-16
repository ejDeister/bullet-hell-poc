// items/loot.js
// <bh-loot>: ground pickups with a simple drop table. Used mainly for the
// after-boss weapon unlock (one new gun per dungeon) and occasional health.
// Pickup is a short-range distance check against any player.

import { Entity } from '../core/entity.js';
import { itemName } from './item.js';

const LABELS = { smg: 'SMG', shotgun: 'Shotgun', sniper: 'Sniper', health: 'Health', item: 'Item' };

export class Loot extends Entity {
  static styleId = 'bh-loot';
  static css = `
    bh-loot {
      position: absolute; left: 0; top: 0;
      width: 26px; height: 26px; margin: -13px 0 0 -13px;
      border-radius: 6px;
      background: linear-gradient(145deg, #ffd86b, #c98a1f);
      box-shadow: 0 0 12px rgba(255,210,100,0.8);
      pointer-events: none;
      animation: bh-loot-bob 1.2s ease-in-out infinite;
    }
    bh-loot::after {
      content: attr(data-label);
      position: absolute; left: 50%; top: -16px; transform: translateX(-50%);
      font: 11px/1 monospace; color: #ffe; white-space: nowrap;
      text-shadow: 0 1px 2px #000;
    }
    @keyframes bh-loot-bob { 0%,100%{filter:brightness(1);} 50%{filter:brightness(1.4);} }
  `;

  constructor() {
    super();
    this.faction = 'neutral';
    this.radius = 20;
    this.pickupRadius = 28;
  }
  connectedCallback() { this.constructor.ensureStyles(); }

  // kind: 'weapon'|'health'|'item'. payload: weapon id / item id.
  drop(game, x, y, kind, payload) {
    this.game = game;
    this.x = x; this.y = y;
    this.kind = kind;
    this.payload = payload;
    this.dead = false; this.alive = true;
    this.dataset.label = LABELS[payload] || LABELS[kind] || 'Loot';
    this._lastTransform = '';
    game.fxLayer.appendChild(this);
    this.applyTransform();
  }

  update(dt, game) {
    for (const p of game.players) {
      if (!p || p.dead) continue;
      const dx = p.x - this.x, dy = p.y - this.y;
      if (dx * dx + dy * dy <= (this.pickupRadius + p.radius) ** 2) {
        this._pickup(game, p);
        return;
      }
    }
  }

  _pickup(game, player) {
    game.audio.pickup();
    if (this.kind === 'weapon') {
      player.giveWeapon(this.payload);
      game.toast(`Picked up ${LABELS[this.payload] || this.payload}!`);
    } else if (this.kind === 'health') {
      player.heal(9999);
      game.toast('Health restored');
    } else if (this.kind === 'item') {
      const slot = player.items.find(s => s.id === this.payload);
      if (slot) slot.count++;
      else if (player.items.length < 3) player.items.push({ id: this.payload, count: 1 });
      game.toast(`Picked up ${itemName(this.payload)}`);
    }
    this.dead = true; this.alive = false; this.remove();
  }
}
customElements.define('bh-loot', Loot);
