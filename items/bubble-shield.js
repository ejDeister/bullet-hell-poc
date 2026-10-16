// items/bubble-shield.js
// <bh-shield>: a placed Halo-style bubble. Outside is impenetrable to bullets;
// enemies and players can walk through it. Enemy bullets that cross the boundary
// from OUTSIDE are destroyed and chip the shield HP. A bullet already inside is
// not blocked. The shield disappears when HP is depleted or its life ends.

import { CONFIG } from '../config.js';
import { Entity } from '../core/entity.js';
import { registerItem } from './item.js';

export class BubbleShield extends Entity {
  static styleId = 'bh-shield';
  static css = `
    bh-shield {
      position: absolute; left: 0; top: 0;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(120,200,255,0.10), rgba(120,200,255,0.05) 70%, rgba(120,200,255,0.25) 100%);
      border: 2px solid rgba(140,210,255,0.8);
      box-shadow: 0 0 20px rgba(120,200,255,0.5), inset 0 0 30px rgba(120,200,255,0.3);
      pointer-events: none;
    }
  `;

  constructor() {
    super();
    this.faction = 'player';
    this.isShield = true;
    this.collides = true;  // participates in bullet narrow-phase
  }
  connectedCallback() { this.constructor.ensureStyles(); }

  place(game, owner) {
    const cfg = CONFIG.items.bubbleShield;
    this.game = game;
    this.owner = owner;
    this.x = owner.x; this.y = owner.y;
    this.radius = cfg.radius;
    this.hp = cfg.hp; this.maxHp = cfg.hp;
    this.life = cfg.life;
    this.dead = false; this.alive = true;
    const d = cfg.radius * 2;
    this.style.width = d + 'px';
    this.style.height = d + 'px';
    this.style.marginLeft = -cfg.radius + 'px';
    this.style.marginTop = -cfg.radius + 'px';
    this._lastTransform = '';
    game.fxLayer.appendChild(this);
    this.applyTransform();
  }

  // Block the bullet only when it is crossing inward from outside. We approximate
  // "from outside" as: the bullet is within the radius band and its velocity
  // points toward the center (entering), so a bullet already inside moving out
  // passes freely.
  blocksBullet(b) {
    const dx = this.x - b.x, dy = this.y - b.y;
    const dist = Math.hypot(dx, dy);
    if (dist > this.radius) return false;        // not inside the boundary yet
    const inward = dx * b.vx + dy * b.vy;          // >0 means moving toward center
    return inward > 0;
  }

  update(dt, game) {
    this.life -= dt;
    if (this.life <= 0 || this.hp <= 0) { this.dead = true; this.alive = false; this.remove(); }
  }

  onDeath(source) { this.dead = true; this.alive = false; this.remove(); }
}
customElements.define('bh-shield', BubbleShield);

registerItem('bubbleShield', {
  name: 'Bubble Shield',
  icon: '○',
  use(game, player) {
    const s = new BubbleShield();
    s.place(game, player);
    game.placeables.push(s);
    return true;
  },
});
