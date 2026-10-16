// ui/dev-menu.js
// <bh-dev-menu>: toggled with ~. Auto-generates controls from CONFIG (numbers ->
// inputs/sliders, booleans -> toggles, enums -> selects), edits values live, and
// supports export/import of the config as JSON. Includes the stress-test actions
// and the auto-benchmark.

import { CONFIG, CONFIG_ENUMS, getPath, setPath } from '../config.js';

export class DevMenu extends HTMLElement {
  static css = `
    bh-dev-menu {
      position: fixed; top: 0; right: 0; bottom: 0; width: 360px; z-index: 60;
      background: rgba(10,12,22,0.96); border-left: 1px solid #2a3350;
      color: #cfe; font: 12px/1.4 ui-monospace, Menlo, monospace;
      overflow-y: auto; padding: 10px 12px; display: none;
    }
    bh-dev-menu.open { display: block; }
    bh-dev-menu h3 { margin: 12px 0 4px; color: #6cf; font-size: 12px; border-bottom: 1px solid #223; }
    bh-dev-menu .row { display:flex; align-items:center; justify-content:space-between; gap:8px; margin:2px 0; }
    bh-dev-menu .row label { color:#9ab; flex:1; overflow:hidden; text-overflow:ellipsis; }
    bh-dev-menu input[type=number] { width:80px; background:#0b0f1e; color:#cfe; border:1px solid #2a3350; border-radius:3px; padding:2px; }
    bh-dev-menu input[type=range] { width:110px; }
    bh-dev-menu select { background:#0b0f1e; color:#cfe; border:1px solid #2a3350; border-radius:3px; }
    bh-dev-menu button { background:#1a2340; color:#cfe; border:1px solid #2a3350; border-radius:4px; padding:5px 8px; margin:2px; cursor:pointer; }
    bh-dev-menu button:hover { background:#25305a; }
    bh-dev-menu .grid { display:flex; flex-wrap:wrap; gap:4px; }
    bh-dev-menu .bench { white-space:pre; background:#0b0f1e; border:1px solid #223; padding:6px; margin-top:6px; max-height:160px; overflow:auto; }
    bh-dev-menu .hint { color:#678; font-size:11px; }
  `;

  connectedCallback() {
    if (!document.getElementById('bh-dev-style')) {
      const s = document.createElement('style'); s.id = 'bh-dev-style';
      s.textContent = DevMenu.css; document.head.appendChild(s);
    }
    this._built = false;
  }

  setGame(game) { this.game = game; }

  toggle() {
    this.classList.toggle('open');
    if (this.classList.contains('open') && !this._built) this.build();
    if (CONFIG.render.pauseOnDevMenu && this.game) this.game.paused = this.classList.contains('open');
  }

  build() {
    this._built = true;
    const g = this.game;
    const h = [];
    h.push(`<h3>Overlays & modes</h3>`);
    h.push(`<div class="grid">
      <button id="togglePerf">Toggle perf overlay</button>
      <button id="openMP">Multiplayer…</button>
      <button id="castApp">Cast to Chromecast (app)</button>
      <button id="castTV">Cast to screen (Presentation)</button></div>`);
    h.push(`<div class="grid">
      <button data-mode="gbcr" class="colmode">gbcr</button>
      <button data-mode="gbcr-naive" class="colmode">gbcr-naive</button>
      <button data-mode="math" class="colmode">math</button>
      <span class="hint" style="align-self:center">collision mode</span></div>`);
    h.push(`<h3>Stress actions</h3>`);
    h.push(`<div class="hint">Spawn bullets around the player</div><div class="grid" id="spawnBullets">
      ${[100, 500, 1000, 5000].map(n => `<button data-n="${n}" data-pat="ring">${n} ring</button>`).join('')}
      ${[100, 500, 1000, 5000].map(n => `<button data-n="${n}" data-pat="spiral">${n} spiral</button>`).join('')}
      ${[100, 500, 1000, 5000].map(n => `<button data-n="${n}" data-pat="random">${n} rnd</button>`).join('')}</div>`);
    h.push(`<div class="hint">Spawn enemies</div><div class="grid" id="spawnEnemies">
      ${['standard', 'tank', 'swarmer'].map(t => `<button data-t="${t}" data-n="10">10 ${t}</button>`).join('')}
      ${['standard', 'tank', 'swarmer'].map(t => `<button data-t="${t}" data-n="50">50 ${t}</button>`).join('')}
      <button id="bossRush">Boss rush</button></div>`);
    h.push(`<div class="grid">
      <button id="stormToggle">Bullet storm: off</button>
      <button id="clearBullets">Clear bullets</button>
      <button id="clearEnemies">Clear enemies</button></div>`);

    h.push(`<h3>Auto-benchmark</h3>`);
    h.push(`<div class="hint">Ramps bullets, finds count where p95 > 16.7ms, per collision mode.</div>`);
    h.push(`<div class="grid"><button id="benchRun">Run benchmark</button><button id="benchDownload">Download JSON</button></div>`);
    h.push(`<div class="bench" id="benchOut">(no run yet)</div>`);

    h.push(`<h3>Live config</h3>`);
    h.push(`<div class="hint">Edits apply immediately. Export/Import below.</div>`);
    h.push(this._renderGroup(CONFIG, ''));
    h.push(`<div class="grid"><button id="exportCfg">Export JSON</button><button id="importCfg">Import JSON</button>
      <button id="resetGame">Restart dungeon</button></div>`);

    this.innerHTML = h.join('');
    this._wire();
  }

  // Recursively render config groups into labeled controls.
  _renderGroup(obj, prefix) {
    let html = '';
    for (const key of Object.keys(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const val = obj[key];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        html += `<h3>${path}</h3>` + this._renderGroup(val, path);
      } else {
        html += this._renderControl(path, val);
      }
    }
    return html;
  }

  _renderControl(path, val) {
    const enums = CONFIG_ENUMS[path];
    const id = 'cfg_' + path.replace(/\./g, '_');
    if (enums) {
      return `<div class="row"><label title="${path}">${path}</label>
        <select data-path="${path}" id="${id}">${enums.map(o => `<option ${o === val ? 'selected' : ''}>${o}</option>`).join('')}</select></div>`;
    }
    if (typeof val === 'boolean') {
      return `<div class="row"><label title="${path}">${path}</label>
        <input type="checkbox" data-path="${path}" ${val ? 'checked' : ''}></div>`;
    }
    if (typeof val === 'number') {
      return `<div class="row"><label title="${path}">${path}</label>
        <input type="number" step="any" data-path="${path}" value="${val}"></div>`;
    }
    if (Array.isArray(val)) {
      return `<div class="row"><label title="${path}">${path}</label>
        <input type="text" data-path="${path}" data-json="1" value='${JSON.stringify(val)}' style="width:140px"></div>`;
    }
    return `<div class="row"><label title="${path}">${path}</label>
      <input type="text" data-path="${path}" value="${val}"></div>`;
  }

  _wire() {
    const g = this.game;
    // Config inputs.
    this.querySelectorAll('[data-path]').forEach(el => {
      el.addEventListener('change', () => {
        const path = el.dataset.path;
        let v;
        if (el.type === 'checkbox') v = el.checked;
        else if (el.tagName === 'SELECT') v = el.value;
        else if (el.dataset.json) { try { v = JSON.parse(el.value); } catch { return; } }
        else if (el.type === 'number') v = parseFloat(el.value);
        else v = el.value;
        setPath(CONFIG, path, v);
        g.onConfigChange(path, v);
      });
    });

    // Overlays & modes.
    this.querySelector('#togglePerf').addEventListener('click', () => g.ui.perf.classList.toggle('visible'));
    this.querySelector('#openMP').addEventListener('click', () => g.ui.signaling.open());
    this.querySelector('#castTV').addEventListener('click', () => {
      if (!g.cast.available()) { g.toast('Presentation API not supported in this browser.'); return; }
      g.cast.onStatus = (m) => g.toast(m);
      g.cast.start();
    });
    this.querySelector('#castApp').addEventListener('click', () => {
      if (!g.castSender.available()) { g.toast('Set cast.appId first (register a Cast receiver).'); return; }
      g.castSender.onStatus = (m) => g.toast(m);
      g.castSender.start();
    });
    this.querySelectorAll('.colmode').forEach(b => b.addEventListener('click', () => {
      g.setCollisionMode(b.dataset.mode);
      const sel = this.querySelector('[data-path="collision.mode"]');
      if (sel) sel.value = b.dataset.mode;
    }));

    // Bullet spawns.
    this.querySelector('#spawnBullets').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      g.stressSpawnBullets(+b.dataset.n, b.dataset.pat);
    });
    // Enemy spawns.
    this.querySelector('#spawnEnemies').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.id === 'bossRush') return g.stressBossRush();
      g.stressSpawnEnemies(b.dataset.t, +b.dataset.n);
    });

    this.querySelector('#stormToggle').addEventListener('click', (e) => {
      g.stormOn = !g.stormOn;
      e.target.textContent = 'Bullet storm: ' + (g.stormOn ? 'on' : 'off');
    });
    this.querySelector('#clearBullets').addEventListener('click', () => g.bullets.clear());
    this.querySelector('#clearEnemies').addEventListener('click', () => g.clearEnemies());
    this.querySelector('#resetGame').addEventListener('click', () => g.restart());

    // Benchmark.
    this.querySelector('#benchRun').addEventListener('click', () => this._runBenchmark());
    this.querySelector('#benchDownload').addEventListener('click', () => this._downloadBench());

    // Export/import.
    this.querySelector('#exportCfg').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(CONFIG, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'bullet-hell-config.json'; a.click();
    });
    this.querySelector('#importCfg').addEventListener('click', () => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json';
      inp.onchange = () => {
        const f = inp.files[0]; if (!f) return;
        const r = new FileReader();
        r.onload = () => { try { Object.assign(CONFIG, JSON.parse(r.result)); this._built = false; this.build(); g.onConfigChange('*'); } catch (e) { alert('Bad JSON'); } };
        r.readAsText(f);
      };
      inp.click();
    });
  }

  // ---- auto-benchmark --------------------------------------------------
  // Ramps bullet count over time per collision mode; records the count at which
  // p95 frame time first exceeds 16.7ms.
  async _runBenchmark() {
    const g = this.game;
    const out = this.querySelector('#benchOut');
    const modes = ['gbcr', 'gbcr-naive', 'math'];
    const results = [];
    const prevMode = CONFIG.collision.mode;
    const wasOpen = this.classList.contains('open');
    this.game.paused = false;
    out.textContent = 'Running...';

    for (const mode of modes) {
      g.setCollisionMode(mode);
      g.bullets.clear();
      let threshold = null;
      // Ramp: add a batch, let it settle, sample p95.
      for (let count = 250; count <= 6000; count += 250) {
        g.stressSpawnBullets(250, 'ring', true); // persistent (long life)
        await this._wait(450); // let frames accumulate
        const p95 = g.profiler.stats().p95;
        if (p95 > 16.7 && threshold === null) { threshold = g.bullets.aliveCount; }
        out.textContent = `mode ${mode}: ${g.bullets.aliveCount} bullets, p95 ${p95.toFixed(1)}ms` +
          (threshold ? ` -> threshold ~${threshold}` : '');
        if (threshold !== null) break;
      }
      results.push({ mode, thresholdBullets: threshold || '>6000', device: navigator.userAgent });
      g.bullets.clear();
      await this._wait(300);
    }

    g.setCollisionMode(prevMode);
    this._benchResults = { when: new Date().toISOString(), results };
    out.textContent = 'Auto-benchmark results (p95 > 16.7ms):\n' +
      results.map(r => `  ${r.mode.padEnd(11)} ~${r.thresholdBullets} bullets`).join('\n') +
      '\n\n' + navigator.userAgent;
  }

  _downloadBench() {
    if (!this._benchResults) { alert('Run the benchmark first.'); return; }
    const blob = new Blob([JSON.stringify(this._benchResults, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'bullet-hell-benchmark.json'; a.click();
  }

  _wait(ms) { return new Promise(r => setTimeout(r, ms)); }
}
customElements.define('bh-dev-menu', DevMenu);
