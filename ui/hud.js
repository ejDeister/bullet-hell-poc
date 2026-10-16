// ui/hud.js
// <bh-hud>: HP bar, stamina bar, weapon + ammo (infinite), item slots, score,
// dungeon label, and a boss HP bar when a boss is active. Plus a toast line.

import { itemIcon, itemName } from '../items/item.js';

export class Hud extends HTMLElement {
  static css = `
    bh-hud {
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 40;
      pointer-events: none; font: 13px/1.3 ui-monospace, Menlo, monospace; color: #dfe;
    }
    bh-hud .bars { position:absolute; left:14px; bottom:14px; width:260px; }
    bh-hud .bar { height:14px; border:1px solid #2a3350; border-radius:4px; background:#0b0f1e; margin-top:4px; overflow:hidden; }
    bh-hud .bar > i { display:block; height:100%; transition:width 0.08s linear; }
    bh-hud .hp > i { background:linear-gradient(90deg,#f55,#f99); }
    bh-hud .sta > i { background:linear-gradient(90deg,#5cf,#9ef); }
    bh-hud .label { font-size:11px; color:#9ab; }
    bh-hud .slots { position:absolute; right:14px; bottom:14px; display:flex; gap:6px; }
    bh-hud .slot { width:46px; height:46px; border:1px solid #2a3350; border-radius:6px; background:rgba(10,14,28,0.8);
                   display:flex; flex-direction:column; align-items:center; justify-content:center; }
    bh-hud .slot.active { border-color:#6cf; box-shadow:0 0 8px rgba(100,200,255,0.6); }
    bh-hud .slot b { font-size:18px; } bh-hud .slot small { font-size:9px; color:#9ab; }
    bh-hud .top { position:absolute; left:50%; top:10px; transform:translateX(-50%); text-align:center; }
    bh-hud .weapon { position:absolute; left:14px; bottom:70px; }
    bh-hud .bossbar { position:absolute; left:50%; top:34px; transform:translateX(-50%); width:50%; }
    bh-hud .bossbar .bar > i { background:linear-gradient(90deg,#f26,#fa5); }
    bh-hud .toast { position:absolute; left:50%; top:70px; transform:translateX(-50%); color:#ffd86b; text-shadow:0 1px 2px #000; }
  `;

  connectedCallback() {
    if (!document.getElementById('bh-hud-style')) {
      const s = document.createElement('style'); s.id = 'bh-hud-style';
      s.textContent = Hud.css; document.head.appendChild(s);
    }
    this.innerHTML = `
      <div class="top"><span class="dungeon"></span> &nbsp; Score <span class="score">0</span></div>
      <div class="toast"></div>
      <div class="bossbar" style="display:none"><div class="label bossname"></div><div class="bar"><i></i></div></div>
      <div class="weapon"></div>
      <div class="bars">
        <div class="label">HP <span class="hpnum"></span></div><div class="bar hp"><i></i></div>
        <div class="label">Stamina</div><div class="bar sta"><i></i></div>
      </div>
      <div class="slots"></div>`;
    this._q = (s) => this.querySelector(s);
  }

  render(game) {
    const p = game.players[0];
    if (!p) return;
    this._q('.hp > i').style.width = Math.max(0, (p.hp / p.maxHp) * 100) + '%';
    this._q('.hpnum').textContent = `${Math.max(0, p.hp | 0)}/${p.maxHp}`;
    this._q('.sta > i').style.width = (p.stamina.frac * 100) + '%';
    this._q('.score').textContent = game.score;
    this._q('.dungeon').textContent = game.dungeonLabel();
    this._q('.weapon').textContent = (p.weapon ? p.weapon.id.toUpperCase() : '—') + '  (ammo ∞)';

    // Item slots.
    const slots = this._q('.slots');
    let html = '';
    p.items.forEach((s, i) => {
      html += `<div class="slot ${i === p.itemIndex ? 'active' : ''}"><b>${itemIcon(s.id)}</b><small>${itemName(s.id).split(' ')[0]}</small><small>x${s.count}</small></div>`;
    });
    slots.innerHTML = html;

    // Boss bar.
    const boss = game.activeBoss;
    const bb = this._q('.bossbar');
    if (boss && !boss.dead) {
      bb.style.display = '';
      this._q('.bossname').textContent = boss.name || 'BOSS';
      this._q('.bossbar .bar > i').style.width = Math.max(0, boss.hpFrac * 100) + '%';
    } else {
      bb.style.display = 'none';
    }

    // Toast.
    this._q('.toast').textContent = game._toastText || '';
  }
}
customElements.define('bh-hud', Hud);
