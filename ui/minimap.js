// ui/minimap.js
// <bh-minimap>: shows the full dungeon layout (static layer drawn once per
// dungeon) with explored/unexplored shading, plus live dots for players, the
// boss, and loot. A <canvas> is acceptable here because the minimap is not part
// of the architecture under test. Element, template, styles, and logic stay here.

import { TILE } from '../world/dungeon.js';

export class Minimap extends HTMLElement {
  static css = `
    bh-minimap {
      position: fixed; top: 8px; right: 8px; z-index: 45;
      width: 180px; height: 180px; border: 1px solid #2a3350; border-radius: 6px;
      background: rgba(6,8,16,0.85); overflow: hidden; pointer-events: none;
    }
    bh-minimap canvas { position:absolute; left:0; top:0; }
  `;

  connectedCallback() {
    if (!document.getElementById('bh-minimap-style')) {
      const s = document.createElement('style'); s.id = 'bh-minimap-style';
      s.textContent = Minimap.css; document.head.appendChild(s);
    }
    this.size = 180;
    this.bg = document.createElement('canvas');     // static layout + explored
    this.fg = document.createElement('canvas');     // live dots
    for (const c of [this.bg, this.fg]) { c.width = this.size; c.height = this.size; this.appendChild(c); }
    this.bgCtx = this.bg.getContext('2d');
    this.fgCtx = this.fg.getContext('2d');
    this._dungeon = null;
    this._explored = null;
  }

  // Draw the static layout once when the dungeon changes.
  setDungeon(d) {
    this._dungeon = d;
    this.scale = this.size / d.size;
    this._explored = new Uint8Array(d.size * d.size);
    this._drawStatic();
  }

  _drawStatic() {
    const d = this._dungeon, ctx = this.bgCtx, s = this.scale;
    ctx.clearRect(0, 0, this.size, this.size);
    for (let ty = 0; ty < d.size; ty++) {
      for (let tx = 0; tx < d.size; tx++) {
        if (d.map[ty * d.size + tx] === TILE.FLOOR) {
          ctx.fillStyle = '#20263e';   // unexplored floor (dim)
          ctx.fillRect(tx * s, ty * s, Math.ceil(s), Math.ceil(s));
        }
      }
    }
  }

  // Reveal explored tiles around a world point (called as players move).
  reveal(d, wx, wy, radiusTiles = 6) {
    const { tx, ty } = d.worldToTile(wx, wy);
    const ctx = this.bgCtx, s = this.scale;
    for (let yy = -radiusTiles; yy <= radiusTiles; yy++) {
      for (let xx = -radiusTiles; xx <= radiusTiles; xx++) {
        const px = tx + xx, py = ty + yy;
        if (px < 0 || py < 0 || px >= d.size || py >= d.size) continue;
        const idx = py * d.size + px;
        if (this._explored[idx]) continue;
        if (d.map[idx] === TILE.FLOOR) {
          this._explored[idx] = 1;
          ctx.fillStyle = '#3a4a7a';    // explored floor (bright)
          ctx.fillRect(px * s, py * s, Math.ceil(s), Math.ceil(s));
        }
      }
    }
  }

  render(game) {
    if (!this._dungeon) return;
    const d = this._dungeon, ctx = this.fgCtx, s = this.scale;
    ctx.clearRect(0, 0, this.size, this.size);
    // Loot (yellow), boss (red), players (cyan).
    for (const l of game.placeables) if (!l.dead && l.kind) this._dot(ctx, l.x / d.ts * s, l.y / d.ts * s, '#fd6', 2);
    for (const l of game.loot || []) if (!l.dead) this._dot(ctx, l.x / d.ts * s, l.y / d.ts * s, '#fd6', 2);
    const boss = game.activeBoss;
    if (boss && !boss.dead) this._dot(ctx, boss.x / d.ts * s, boss.y / d.ts * s, '#f44', 4);
    for (const p of game.players) if (p && !p.dead) this._dot(ctx, p.x / d.ts * s, p.y / d.ts * s, '#6cf', 3);
  }

  _dot(ctx, x, y, color, r) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
}
customElements.define('bh-minimap', Minimap);
