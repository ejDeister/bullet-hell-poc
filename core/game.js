// core/game.js
// Main loop, state machine, and wiring. Owns the entity lists, the systems
// (dungeon, grid, virtualizer, collision, profiler), the UI elements, and the
// progression. All per-system timing is recorded through the profiler so the
// perf overlay and benchmark can attribute cost.

import { CONFIG } from '../config.js';
import { RNG } from './rng.js';
import { Input } from './input.js';
import { LoopProfiler } from './loop-profiler.js';
import { SFX } from './audio.js';
import { Dungeon } from '../world/dungeon.js';
import { Camera } from '../world/camera.js';
import { Virtualizer } from '../world/virtualizer.js';
import { CollisionSystem } from '../collision/collision.js';
import { BulletSystem } from '../projectiles/bullet.js';
import { Player } from '../player/player.js';
import { Standard } from '../enemies/standard.js';
import { Tank } from '../enemies/tank.js';
import { Swarmer } from '../enemies/swarmer.js';
import { Boss1 } from '../bosses/boss1.js';
import { Boss2 } from '../bosses/boss2.js';
import { Boss3 } from '../bosses/boss3.js';
import { Loot } from '../items/loot.js';
import { useItem } from '../items/item.js';
import { Netcode } from '../net/netcode.js';
import { SpectatorCast } from '../net/cast.js';
// Side-effect imports: register item descriptors.
import '../items/health-potion.js';
import '../items/speed-elixir.js';
import '../items/proximity-mine.js';
import '../items/bubble-shield.js';

const ENEMY_CLASSES = { standard: Standard, tank: Tank, swarmer: Swarmer };
const BOSS_CLASSES = [Boss1, Boss2, Boss3];

export class Game {
  constructor(root) {
    this.root = root;
    this._buildLayers();

    this.profiler = new LoopProfiler();
    this.audio = new SFX();
    this.input = new Input();
    this.camera = new Camera(this.world, this.viewport);
    this.virtualizer = new Virtualizer(this.entityLayer, this.wallLayer);
    this.collision = new CollisionSystem(this.profiler);

    this.players = [];
    this.enemies = [];
    this.projectiles = [];   // grenades, bombs (non-pooled arcing projectiles)
    this.placeables = [];    // mines, shields
    this.loot = [];

    this.bullets = new BulletSystem(this);

    this.score = 0;
    this.dungeonIndex = 0;
    this.endless = false;
    this.endlessFloor = 0;
    this.state = 'play';     // 'play' | 'boss' | 'gameover' | 'cleared'
    this.paused = false;
    this.activeBoss = null;
    this.stormOn = false;
    this._netSeq = 0;
    this.net = null;
    this.role = null;        // 'host' | 'guest' | null (single-player)
    this.localSlot = 0;      // which players[] index the local input drives
    this._interpRate = 12;   // interpolation smoothing rate (1/sec)
    this.cast = new SpectatorCast(this); // spectator cast to a TV (experimental)

    this._toastText = '';
    this._toastTimer = 0;
    this._last = performance.now();
    this._accum = 0;

    this.ui = {};
  }

  _buildLayers() {
    this.viewport = document.getElementById('viewport');
    this.world = document.getElementById('world');
    // Sub-layers for z-order (all children of the moving world container).
    this.wallLayer = this._layer('wall-layer');
    this.fxLayer = this._layer('fx-layer');     // loot, mines, shields, explosions behind entities
    this.entityLayer = this._layer('entity-layer');
    this.bulletLayer = this._layer('bullet-layer');
  }
  _layer(cls) {
    const d = document.createElement('div');
    d.className = cls;
    d.style.cssText = 'position:absolute;left:0;top:0;';
    this.world.appendChild(d);
    return d;
  }

  attachUI(ui) { this.ui = ui; }

  // ---- lifecycle -------------------------------------------------------
  start() {
    this.loadDungeon(0);
    requestAnimationFrame(this._frame);
  }

  loadDungeon(index) {
    this.clearAll();
    this.dungeonIndex = index;
    this.rng = new RNG(CONFIG.world.seed + index * 101);
    this.dungeon = new Dungeon(CONFIG.world.seed, index);
    this.virtualizer.frame = 0;
    this.virtualizer._clearWalls && this.virtualizer._clearWalls();
    this.state = 'play';
    this.activeBoss = null;

    // Player at the start room.
    const start = this.dungeon.startWorld();
    if (!this.players[0]) {
      const p = new Player();
      this.entityLayer.appendChild(p);
      p.setup(this);
      this.players[0] = p;
    }
    const p0 = this.players[0];
    p0.x = start.x; p0.y = start.y; p0.dead = false; p0.hp = p0.maxHp;
    p0.applyTransform();
    this.camera.x = start.x; this.camera.y = start.y;

    // Minimap static layer.
    if (this.ui.minimap) this.ui.minimap.setDungeon(this.dungeon);

    this.toast(this.dungeonLabel() + ' — clear the rooms, then the boss.');
  }

  dungeonLabel() {
    if (this.endless) return 'ENDLESS floor ' + (this.endlessFloor + 1);
    return 'Dungeon ' + (this.dungeonIndex + 1) + '/' + CONFIG.progression.dungeons;
  }

  clearEnemies() {
    for (const e of this.enemies) e.remove();
    this.enemies.length = 0;
    if (this.activeBoss) { this.activeBoss.remove(); this.activeBoss = null; }
  }

  clearAll() {
    this.clearEnemies();
    this.bullets.clear();
    for (const pr of this.projectiles) pr.remove && pr.remove();
    for (const pl of this.placeables) pl.remove && pl.remove();
    for (const l of this.loot) l.remove && l.remove();
    this.projectiles.length = 0;
    this.placeables.length = 0;
    this.loot.length = 0;
  }

  restart() {
    this.endless = false; this.endlessFloor = 0; this.score = 0;
    this.loadDungeon(0);
    this.state = 'play';
  }

  // ---- main loop -------------------------------------------------------
  _frame = (now) => {
    const dtRaw = Math.min(0.05, (now - this._last) / 1000); // clamp big gaps
    this._last = now;
    this.profiler.frameStart();
    if (!this.paused && this.state !== 'gameover') {
      this.update(dtRaw);
    }
    this.render();
    this.profiler.frameEnd();
    this.input.endFrame();
    requestAnimationFrame(this._frame);
  };

  update(dt) {
    const prof = this.profiler;

    // Input-driven player(s) + AI classification.
    prof.begin('input'); /* input is event-driven; marker kept for symmetry */ prof.end('input');

    // Sim-distance classification (considers all players).
    prof.begin('virtualize');
    this.virtualizer.classify(this.enemies, this.players);
    prof.end('virtualize');

    // Players. Only the local player reads input; the local update also runs
    // for the host. Remote players integrate/interpolate in _updateNetPlayers.
    prof.begin('player');
    for (const p of this.players) if (p && !p.dead && p.isLocal) p.update(dt, this);
    if (this.net) this._updateNetPlayers(dt);
    else for (const p of this.players) if (p && !p.dead && !p.isLocal) p.update(dt, this);
    prof.end('player');

    // Enemy AI + movement. The guest is not authoritative: it interpolates
    // enemies toward the host snapshot instead of running AI.
    prof.begin('ai');
    if (this.role === 'guest') {
      this._interpolateEnemies(dt);
    } else {
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        if (e.dead) continue;
        if (this.virtualizer.shouldSim(e)) e.update(dt, this);
      }
    }
    prof.end('ai');

    // Arcing projectiles (grenades/bombs), placeables, loot.
    prof.begin('projectiles');
    this._updateList(this.projectiles, dt);
    this._updateList(this.placeables, dt);
    this._updateList(this.loot, dt);
    prof.end('projectiles');

    // Bullets.
    prof.begin('bullets');
    this.bullets.update(dt);
    prof.end('bullets');

    // Bullet storm spawner.
    if (this.stormOn) this._stormTick(dt);

    // Collision (the thing under test). Transforms are applied in render(),
    // but for gBCR correctness we must write transforms BEFORE reading rects.
    // So we apply entity transforms here, then resolve, then render bullets.
    prof.begin('transform');
    this._applyTransforms();
    prof.end('transform');

    // Collision authority stays on the host. The guest skips resolve to avoid
    // fighting the snapshot (double authority causes flicker and desync).
    prof.begin('collision');
    if (this.role !== 'guest') this.collision.resolve(this);
    prof.end('collision');

    // Compact enemy list.
    this._compact(this.enemies);
    this._compact(this.projectiles);
    this._compact(this.placeables);
    this._compact(this.loot);

    // Room activation + boss trigger + progression. Host-authoritative only.
    prof.begin('spawn');
    if (this.role !== 'guest') this._updateRooms();
    prof.end('spawn');

    // Camera follows the centroid of living players.
    this._updateCamera(dt);

    // Materialize walls near the camera (DOM virtualization for walls).
    prof.begin('walls');
    this.virtualizer.updateWalls(this.dungeon, this.camera);
    prof.end('walls');

    // Minimap reveal.
    if (this.ui.minimap) {
      for (const p of this.players) if (p && !p.dead) this.ui.minimap.reveal(this.dungeon, p.x, p.y);
    }

    // Networking.
    if (this.net) { prof.begin('net'); this.net.update(dt); prof.end('net'); }

    // Spectator cast stream (experimental). Streams state + perf to a TV.
    if (this.cast && this.cast.active) { prof.begin('cast'); this.cast.tick(dt); prof.end('cast'); }

    // Toast timer + dataset flush.
    if (this._toastTimer > 0) { this._toastTimer -= dt; if (this._toastTimer <= 0) this._toastText = ''; }
    if (CONFIG.render.datasetWriteMode === 'lazy') for (const e of this.enemies) e.flushDataset();
  }

  _applyTransforms() {
    // Entities (players, enemies) write their transform once. Bullets in DOM
    // mode are handled in bullets.render(); but gBCR needs them written before
    // collision, so write DOM bullets here too.
    for (const p of this.players) if (p && !p.dead) p.applyTransform();
    for (const e of this.enemies) if (!e.dead && e.simTier !== 'dormant') e.applyTransform();
    if (CONFIG.render.bulletTarget === 'dom') {
      const list = this.bullets.list;
      for (let i = 0; i < list.length; i++) if (list[i].simTier !== 'dormant') list[i].applyTransform();
    }
    for (const e of this.enemies) if (CONFIG.render.datasetWriteMode === 'everyFrame') e.syncDataset();

    // Attribute-selector stress test: write a hot dataset prop every frame so
    // the [data-state=...] rules below force a style recalc. Compare against
    // class toggles (the default path) to see the cost.
    if (CONFIG.render.attributeSelectorTest) {
      this._ensureAttrStyle();
      const band = (Math.floor(performance.now() / 100) % 3);
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        if (e.simTier !== 'dormant') e.dataset.state = band === 0 ? 'a' : band === 1 ? 'b' : 'c';
      }
      const list = this.bullets.list;
      for (let i = 0; i < list.length; i++) list[i].dataset.state = band === 0 ? 'a' : 'b';
    }
  }

  _ensureAttrStyle() {
    if (document.getElementById('bh-attr-test')) return;
    const s = document.createElement('style');
    s.id = 'bh-attr-test';
    // Attribute selectors on a per-frame-written prop (deliberately expensive).
    s.textContent = `
      bh-bullet[data-state="a"] { filter: brightness(1.0); }
      bh-bullet[data-state="b"] { filter: brightness(1.2); }
      bh-standard[data-state="a"], bh-tank[data-state="a"], bh-swarmer[data-state="a"] { filter: brightness(1.0); }
      bh-standard[data-state="b"], bh-tank[data-state="b"], bh-swarmer[data-state="b"] { filter: brightness(1.1); }
      bh-standard[data-state="c"], bh-tank[data-state="c"], bh-swarmer[data-state="c"] { filter: brightness(1.2); }
    `;
    document.head.appendChild(s);
  }

  render() {
    const prof = this.profiler;
    prof.begin('render');
    this.camera.apply();
    this.bullets.render();
    prof.end('render');

    // UI.
    if (this.ui.perf && this.ui.perf.classList.contains('visible')) {
      this.ui.perf.render(this.profiler, this._extraCounters());
    }
    if (this.ui.hud) this.ui.hud.render(this);
    if (this.ui.minimap) this.ui.minimap.render(this);
  }

  _extraCounters() {
    const vc = this.virtualizer.counts(this.enemies);
    return {
      entities: this.enemies.length + this.players.filter(p => p && !p.dead).length,
      active: vc.active, near: vc.near, dormant: vc.dormant,
      domNodes: this.world.getElementsByTagName('*').length,
      bulletsAlive: this.bullets.aliveCount,
      poolFree: this.bullets.pool.freeCount,
      poolHits: this.bullets.pool.hits,
      poolMiss: this.bullets.pool.misses,
      colMode: CONFIG.collision.mode,
      netRtt: this.net ? Math.round(this.net.rtt) : 0,
    };
  }

  // ---- helpers ---------------------------------------------------------
  _updateList(list, dt) {
    for (let i = 0; i < list.length; i++) { const e = list[i]; if (!e.dead) e.update(dt, this); }
  }
  _compact(list) {
    let w = 0;
    for (let i = 0; i < list.length; i++) if (!list[i].dead) list[w++] = list[i];
    list.length = w;
  }

  _updateCamera(dt) {
    // When networked, follow the local player only. Otherwise follow the
    // centroid of living players (local co-op).
    if (this.net) {
      const lp = this.players[this.localSlot];
      if (lp && !lp.dead) this.camera.follow(lp.x, lp.y, dt);
      return;
    }
    let cx = 0, cy = 0, n = 0;
    for (const p of this.players) if (p && !p.dead) { cx += p.x; cy += p.y; n++; }
    if (n) { this.camera.follow(cx / n, cy / n, dt); }
  }

  // ---- spawning & rooms ------------------------------------------------
  spawnEnemy(type, x, y) {
    const Cls = ENEMY_CLASSES[type];
    if (!Cls) return null;
    const e = new Cls();
    e.game = this;
    e.reset();
    e.x = x; e.y = y;
    e._lastTransform = '';
    this.entityLayer.appendChild(e);
    e.applyTransform();
    this.enemies.push(e);
    return e;
  }

  spawnBoss() {
    const idx = this.endless ? (this.endlessFloor % 3) : Math.min(this.dungeonIndex, 2);
    const Cls = BOSS_CLASSES[idx];
    const b = new Cls();
    b.game = this;
    b.reset();
    // Scale HP in endless.
    if (this.endless) { const m = 1 + this.endlessFloor * 0.25; b.maxHp *= m; b.hp = b.maxHp; }
    const br = this.dungeon.bossRoomWorld();
    b.x = br.cx; b.y = br.cy;
    b._lastTransform = '';
    this.entityLayer.appendChild(b);
    b.applyTransform();
    this.enemies.push(b);
    this.activeBoss = b;
    this.state = 'boss';
    this.audio.bossAppear();
    this.toast('BOSS: ' + (b.name || '???'));
  }

  // Activate a room's spawns when a player enters it; trigger boss in boss room.
  _updateRooms() {
    const p = this.players[0];
    if (!p || p.dead) return;
    const { tx, ty } = this.dungeon.worldToTile(p.x, p.y);
    for (const room of this.dungeon.rooms) {
      const inside = tx >= room.x && tx < room.x + room.w && ty >= room.y && ty < room.y + room.h;
      if (!inside) continue;
      if (room.isBoss && !this.activeBoss && this.state !== 'cleared' && !room._bossSpawned) {
        room._bossSpawned = true;
        this.spawnBoss();
      }
      if (room.spawns && !room._activated) {
        room._activated = true;
        for (const s of room.spawns) {
          if (s.type === 'swarmer') {
            for (let i = 0; i < CONFIG.enemies.swarmer.groupSize; i++)
              this.spawnEnemy('swarmer', s.x + (Math.random() - 0.5) * 60, s.y + (Math.random() - 0.5) * 60);
          } else {
            this.spawnEnemy(s.type, s.x, s.y);
          }
        }
      }
    }
  }

  // ---- combat callbacks ------------------------------------------------
  onKill(entity, killer) {
    this.score += entity.score || 0;
    this.audio.enemyDeath();
  }

  onBossDefeated(boss) {
    this.activeBoss = null;
    this.score += 500;
    this._dropBossLoot();
    if (this.endless) {
      this.endlessFloor++;
      this.toast('Floor cleared! Descending...');
      setTimeout(() => this.loadDungeon(this.dungeonIndex + 1 + 1000 + this.endlessFloor), 1800);
      return;
    }
    if (this.dungeonIndex + 1 < CONFIG.progression.dungeons) {
      this.toast('Boss down! Next dungeon unlocked.');
      setTimeout(() => this.loadDungeon(this.dungeonIndex + 1), 2200);
    } else {
      this.state = 'cleared';
      this.toast('All bosses defeated! Press ENTER for Endless mode.');
      this._awaitEndless = true;
    }
  }

  _dropBossLoot() {
    // One new gun per dungeon, per the unlock order.
    const order = CONFIG.progression.unlockOrder;
    const id = this.endless ? 'health' : order[Math.min(this.dungeonIndex, order.length - 1)];
    const br = this.dungeon.bossRoomWorld();
    const l = new Loot();
    if (this.endless) l.drop(this, br.cx, br.cy, 'health', 'health');
    else l.drop(this, br.cx, br.cy, 'weapon', id);
    this.loot.push(l);
  }

  onPlayerDeath(player) {
    player.dead = true;
    player.style.display = 'none';
    // Co-op: only game over if all players are down.
    if (this.players.every(p => !p || p.dead)) {
      this.state = 'gameover';
      this.audio.gameOver();
      this.toast('GAME OVER — press ENTER to restart.');
      this._awaitRestart = true;
    }
  }

  onPlayerFire(weapon) { this.audio.shoot(weapon.id); }

  // Area-of-effect damage (explosions). faction = who it hurts the opposite of.
  areaDamage(x, y, radius, damage, faction, owner) {
    const r2 = radius * radius;
    if (faction === 'enemy') {
      for (const p of this.players) {
        if (!p || p.dead) continue;
        const dx = p.x - x, dy = p.y - y;
        if (dx * dx + dy * dy <= r2) p.damage(damage, owner);
      }
    } else {
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dx = e.x - x, dy = e.y - y;
        if (dx * dx + dy * dy <= r2) { if (e.damage(damage, owner)) this.onKill(e, owner); }
      }
    }
  }

  useItem(player, id) { return useItem(this, player, id); }

  toast(text) { this._toastText = text; this._toastTimer = 3.5; }

  hideLasers() {
    for (const p of this.players) for (const w of (p ? p.weapons : [])) if (w.hideSight) w.hideSight();
  }

  // ---- config change handling ------------------------------------------
  onConfigChange(path, value) {
    if (path === 'collision.mode') this.setCollisionMode(value);
    if (path === 'sim.virtualizeWalls' || path === '*') this.virtualizer._clearWalls();
    if (path && path.startsWith('render.bulletTarget')) { /* bullets.render handles switch */ }
  }
  setCollisionMode(mode) {
    CONFIG.collision.mode = mode;
    this.collision.setMode(mode);
  }

  // ---- stress actions --------------------------------------------------
  stressSpawnBullets(n, pattern = 'ring', persistent = false) {
    const p = this.players[0] || { x: this.camera.x, y: this.camera.y };
    const opts = {
      life: persistent ? 999 : 2.0, damage: 0, radius: 4, pierce: 0,
      owner: null, faction: 'enemy',
    };
    for (let i = 0; i < n; i++) {
      let dir;
      if (pattern === 'ring') dir = (i / n) * Math.PI * 2;
      else if (pattern === 'spiral') dir = (i * 0.5);
      else dir = Math.random() * Math.PI * 2;
      const speed = persistent ? 40 : 160 + (pattern === 'spiral' ? i * 0.1 : 0);
      this.bullets.spawn(p.x, p.y, dir, speed, opts);
    }
  }

  stressSpawnEnemies(type, n) {
    const p = this.players[0] || { x: this.camera.x, y: this.camera.y };
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 150 + Math.random() * 400;
      this.spawnEnemy(type, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
    }
  }

  stressBossRush() {
    const p = this.players[0];
    [Boss1, Boss2, Boss3].forEach((Cls, i) => {
      const b = new Cls(); b.game = this; b.reset();
      b.x = p.x + (i - 1) * 300; b.y = p.y - 400;
      b._lastTransform = ''; this.entityLayer.appendChild(b); b.applyTransform();
      this.enemies.push(b);
      if (i === 0) this.activeBoss = b;
    });
  }

  _stormTick(dt) {
    this._stormAcc = (this._stormAcc || 0) + dt;
    const rate = 0.05; // spawn burst interval
    while (this._stormAcc >= rate) {
      this._stormAcc -= rate;
      this.stressSpawnBullets(12, 'spiral');
    }
  }

  // ---- networking hooks (experimental) ---------------------------------
  // Slot convention on BOTH machines: players[0] = host avatar, players[1] =
  // guest avatar. The local input drives players[localSlot]. The host owns
  // slot 0, the guest owns slot 1. So both peers agree on who is who.
  startNetGame(peer) {
    this.net = new Netcode(this, peer);
    this.role = peer.isHost ? 'host' : 'guest';
    this.localSlot = peer.isHost ? 0 : 1;

    const start = this.dungeon.startWorld();
    // Ensure both slots exist.
    if (!this.players[0]) {
      const p0 = new Player();
      this.entityLayer.appendChild(p0);
      p0.setup(this);
      this.players[0] = p0;
    }
    if (!this.players[1]) {
      const p1 = new Player();
      this.entityLayer.appendChild(p1);
      p1.setup(this);
      this.players[1] = p1;
    }
    // Place both near the start; mark local vs remote by role.
    this.players[0].x = start.x; this.players[0].y = start.y;
    this.players[1].x = start.x + 50; this.players[1].y = start.y;
    this.players.forEach((p, i) => {
      p.dead = false; p.style.display = '';
      p.isLocal = (i === this.localSlot);
      p.netTarget = { x: p.x, y: p.y };   // interpolation target (remote)
      p.netInput = { x: 0, y: 0, fire: false, aim: 0 }; // integration input (remote on host)
      p._lastTransform = ''; p.applyTransform();
    });
    this.toast('Multiplayer connected (experimental, ' + this.role + ', ' + CONFIG.net.mode + ').');
  }

  endNetGame() {
    if (this.net) { this.net = null; }
    this.role = null; this.localSlot = 0;
    if (this.players[1]) { this.players[1].remove(); this.players[1] = null; }
    if (this.players[0]) this.players[0].isLocal = true;
    this.toast('Back to single-player.');
  }

  // Host receives the guest input. Store it for per-frame integration; fire now
  // (the weapon cooldown gates the cadence).
  applyRemoteInput(input) {
    const remoteSlot = 1 - this.localSlot; // host -> guest avatar (slot 1)
    const p = this.players[remoteSlot];
    if (!p || p.dead) return;
    p.netInput = input;
    p.aim = input.aim;
    if (input.fire && p.weapon && p.weapon.canFire()) p.weapon.fire(this, p, input.aim);
  }

  // Per-frame remote-player handling. Host integrates the stored input at real
  // dt (smooth, full speed). Guest interpolates the host avatar toward the
  // snapshot target (removes 30 Hz snap jitter).
  _updateNetPlayers(dt) {
    const k = 1 - Math.exp(-dt * this._interpRate);
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (!p || p.dead || p.isLocal) continue;
      p.stamina.update(dt);
      p.weapon && p.weapon.tick(dt);
      if (this.role === 'host') {
        const inp = p.netInput;
        const base = CONFIG.player.baseSpeed;
        p._moveWithWalls(this.dungeon, inp.x * base * dt, inp.y * base * dt);
        p.netTarget = { x: p.x, y: p.y };
      } else {
        // Guest: smooth toward the authoritative target.
        const t = p.netTarget;
        p.x += (t.x - p.x) * k;
        p.y += (t.y - p.y) * k;
      }
      p.style.setProperty('--aim', p.aim + 'rad');
    }
  }

  // Guest: smooth every enemy toward its snapshot target.
  _interpolateEnemies(dt) {
    const k = 1 - Math.exp(-dt * this._interpRate);
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.dead || !e.netTarget) continue;
      e.x += (e.netTarget.x - e.x) * k;
      e.y += (e.netTarget.y - e.y) * k;
      e.applyTransform();
    }
  }

  // Guest applies the host snapshot. It sets interpolation targets instead of
  // teleporting, so motion stays smooth between the 30 Hz snapshots.
  applyRemoteSnapshot(msg) {
    if (!msg.p) return;
    msg.p.forEach((pp, i) => {
      const p = this.players[i];
      if (!p || !pp) return;
      p.hp = pp[2];
      p.aim = pp[3];
      if (i === this.localSlot) {
        // The guest's own avatar: trust local prediction. Correct only on a
        // large error (a hard snap, for example after a wall or a dash).
        const err = Math.hypot(p.x - pp[0], p.y - pp[1]);
        if (err > 150) { p.x = pp[0]; p.y = pp[1]; }
      } else {
        // The remote (host) avatar: set the interpolation target.
        p.netTarget = { x: pp[0], y: pp[1] };
      }
    });
    // Enemies: reconcile by netId. New -> create. Seen -> set target. Gone -> remove.
    const seen = new Set();
    for (const [id, kind, x, y, hp] of msg.e) {
      seen.add(id);
      let e = this.enemies.find(en => en.netId === id);
      if (!e) {
        const type = ENEMY_CLASSES[kind] ? kind : 'standard';
        e = this.spawnEnemy(type, x, y);
        if (e) { e.netId = id; e.netTarget = { x, y }; }
      }
      if (e) { e.netTarget = { x, y }; e.hp = hp; }
    }
    for (const e of this.enemies) if (e.netId && !seen.has(e.netId)) { e.kill(); e.remove(); }
  }
}
