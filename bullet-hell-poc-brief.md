# Bullet Hell PoC: Conversation Summary and Build Brief

## Part 1: Conversation summary (context for the agent)

### Canvas vs. SVG + CSS
- Canvas is immediate-mode: no object model, manual animation loop, manual hit testing, no CSS styling, poor accessibility, manual DPR handling, hard to debug. It wins on raw throughput (tens of thousands of sprites, pixel work).
- SVG/HTML elements are retained-mode: the browser tracks them, gives events, CSS, and DevTools inspection. They get slow at high node counts.

### Rendering pipeline: layout -> paint -> composite
- **Layout** (width, height, top/left, margin, display) is the most expensive. **Paint** (color, background, shadows) is the middle tier. **Composite** (`transform`, `opacity`) is the cheapest and can run on the compositor without the main thread.
- "Relayout" is not always large. Browsers dirty-track, and isolated subtrees (`contain: layout`, absolutely positioned containers, an `<svg>` root) scope the damage.
- **Layout thrashing:** interleaving DOM writes and forced-layout reads (`offsetWidth`, `getBoundingClientRect`, `getComputedStyle`) forces repeated synchronous flushes. Batch reads, then writes.
- **GPU promotion:** `will-change: transform`, 3D transforms, animating transform/opacity. Don't blanket-apply, since each layer costs GPU memory.
- **SVG caveat:** children of an `<svg>` generally aren't promoted individually, so moving many children tends to repaint the whole SVG. Paint cost caps SVG scenes before collision does.
- Group with `<g>` only when children move as a unit. Independently moving entities are independent elements regardless of nesting. Nesting helps scoping (contain static from dynamic), not per-entity cost.

### Collision with transform-only motion + `getBoundingClientRect` (gBCR)
- Transform writes dirty *style*, not layout. A gBCR after a write forces a small style flush, not a layout cascade.
- **Player vs. wall:** a few gBCR calls per frame is microseconds. Fine at any normal scale.
- **Bullets:** write all, then read all = about one flush. Interleaving write/read per bullet = N flushes. Still OK up to a few hundred.
- **What hurts first (in order):** (1) N x M pair checks, (2) SVG paint cost, (3) attribute selectors like `[data-state="hit"]` causing broader style recalcs on dataset writes, (4) DOM churn from spawn/remove.
- **Rough thresholds (individual elements, device-dependent):** transform-only writes: thousands OK. Write + gBCR: a few hundred before it's noticeable. Inside a single SVG: lower.
- **Gotchas:** gBCR on rotated elements returns an axis-aligned (inflated) box. gBCR is viewport-space, so camera movement invalidates cached rects unless the camera is a parent transform and everything is compared in the same space. If CSS transitions/animations drive the transform, gBCR returns the *interpolated* position, not the logical one. Fast bullets can tunnel through thin walls.
- **Design stance:** the "intuitive" architecture is acceptable: state in `dataset`, mutate via JS, animate via CSS transform, collide via existing browser APIs. Optimize only if the profiler shows a bottleneck.

### What this PoC is for
Build the intuitive architecture above and **stress test it** so we can find where it actually breaks. The PoC must make bottlenecks *measurable and attributable*, not just play well.

---

## Part 2: Instructions for the build agent

### Goal
Build a procedurally generated top-down bullet hell game as a proof of concept, using **DOM custom elements (no Shadow DOM), `dataset` for game state, CSS `transform` for all positioning/animation, and `getBoundingClientRect` for collision**. Vanilla JS (ES modules), no framework, no build step required (a static server is fine). The deliverable is a game plus instrumentation that shows how far the architecture scales.

### Hard architectural rules
1. **Entities are custom elements.** Each entity type (`<bh-player>`, `<bh-bullet>`, `<bh-enemy>`, etc.) is a class extending `HTMLElement`. **No Shadow DOM.**
2. **Entity state lives in `dataset`** (e.g. `data-hp`, `data-type`, `data-faction`, `data-damage`). Strings in, so provide typed getters/setters on the class. JS reads and writes these. Treat the element as the object.
3. **All positioning and animation use `transform`** (translate/rotate/scale). Never animate `left/top/width/height/margin`. Set `will-change: transform` only on long-lived entities (player, enemies), not bullets.
4. **Collision uses `getBoundingClientRect` and similar built-in APIs** as the primary path (this is the thing under test). See "Collision modes" below.
5. **Do not use attribute selectors on frequently written dataset props** in stylesheets unless deliberately testing it (provide a toggle for that, see stress tests). Prefer classes toggled sparingly.
6. **Behavior is local, organized by module/feature, not by code type.** A custom element's class, its `innerHTML` template, and its CSS rules live in the **same file**. CSS is injected once per class (a static `ensureStyles()` that appends a `<style>` to `document.head` if not already present). No global stylesheet files except a minimal reset/layout one.
7. **OOP and very modular.** Small classes, clear base classes (e.g. `Entity`, `Projectile`, `Enemy`, `Boss`, `Weapon`, `Item`), composition where it helps.
8. **Everything tunable is in one config file** (`config.js`). No magic numbers in modules.

### Suggested file structure (by feature)
```
/index.html
/config.js                      # all tunables, single source of truth
/core/
  game.js                       # main loop, state machine, wiring
  entity.js                     # base Entity custom element (dataset helpers, transform helpers, pooling hooks)
  pool.js                       # element pooling (bullets especially)
  rng.js                        # seeded PRNG (shared by host/client)
  input.js                      # wasd, mouse, shift, space, q/e/f, ~
  loop-profiler.js              # frame timing, per-system timings, counters
/world/
  dungeon.js                    # procedural generation (rooms + corridors), seeded
  grid.js                       # spatial grid / chunking
  virtualizer.js                # sim distance + DOM virtualization
  wall.js                       # <bh-wall> element (+ its CSS)
  camera.js                     # camera as a transform on a world container
/player/
  player.js                     # <bh-player>, movement, stamina, sprint, dash, inventory
  stamina.js
/weapons/
  weapon.js                     # base class
  pistol.js  smg.js  sniper.js  shotgun.js   # each is self-contained (incl. laser for sniper)
/projectiles/
  bullet.js  grenade.js  bomb.js  explosion.js
/enemies/
  enemy.js                      # base
  standard.js  tank.js  swarmer.js
/bosses/
  boss.js  boss1.js  boss2.js  boss3.js
/items/
  item.js  health-potion.js  speed-elixir.js  proximity-mine.js  bubble-shield.js
  loot.js                       # <bh-loot> pickups, drop tables
/collision/
  collision.js                  # strategy interface + mode switch
  gbcr-collision.js             # the DOM-API strategy (primary, under test)
  math-collision.js             # pure-JS comparison strategy
/net/
  peer.js                       # RTCPeerConnection wrapper
  signaling-ui.js               # <bh-signaling> copy/paste b64 SDP UI
  netcode.js                    # state sync, input forwarding
/ui/
  hud.js                        # <bh-hud>: hp, stamina, ammo (infinite), item slots
  minimap.js                    # <bh-minimap>
  dev-menu.js                   # <bh-dev-menu>, toggled with ~
  perf-overlay.js               # <bh-perf>
```
Adjust names as needed, but keep the principle: a feature's element, template, styles, and logic stay together.

---

### Core gameplay

**Controls**
- `WASD` move, mouse aims, left click fires (hold for automatic weapons).
- `Shift` sprint (drains stamina while held and moving). `Space` dash (instant burst, consumes a chunk of stamina, short cooldown, brief i-frames optional via config). Stamina regenerates after a delay. Cannot sprint or dash at insufficient stamina.
- `Q` / `E` cycle item slots, `F` uses the active item.
- `~` (backtick/tilde) toggles the dev/config menu.
- **Ammo is infinite.** No reload mechanic required, though weapons have fire rates.

**Weapons**
| Weapon | Notes | Move speed penalty while held |
|---|---|---|
| Pistol | Starter | 0% |
| SMG | High fire rate, low damage, spread | 5% |
| Shotgun | Multi-pellet cone, short range | 10% |
| Sniper | Slow, high damage, piercing optional, **visible laser sight** | 15% |

- Penalties apply to base and sprint movement but **do not affect dash**.
- The sniper laser is a styled element (rotated/scaled via transform) following the aim direction, ideally clipped at the first wall hit.

**Loot progression**
- **One new gun per dungeon, dropped after the boss fight.** Dungeon 1 -> SMG-class unlock, dungeon 2 -> shotgun, dungeon 3 -> sniper (order is configurable). Player starts with the pistol.
- After beating all three bosses, offer an optional **endless mode** (continuous procedural floors, scaling difficulty, bosses recycle with scaling). This is the main long-run stress mode.
- **Items:** three item slots, one active at a time. `Q/E` cycles, `F` activates.
  - **Health potion:** heals a configured amount.
  - **Speed boost elixir:** timed movement speed multiplier (stamina interactions configurable).
  - **Proximity mine:** placed at the player's position, arms after a short delay, detonates when an enemy (or an opposing player in PvP) enters its radius.
  - **Bubble shield (Halo-style):** a placed bubble. **Outside is impenetrable to bullets; enemies and players can walk through it.** Bullets that hit it chip its HP, and it disappears once depleted. Implement bullet-vs-bubble as "bullet destroyed if it crosses the boundary from outside" (a bullet already inside is not blocked). Have enemy bullets damage it.

**Enemies**
1. **Standard:** approaches the player, fires projectiles, deals heavier damage on contact.
2. **Tank:** slow and high HP, fires **grenades** (arcing/slow projectiles that explode on landing or after a fuse, with area damage).
3. **Swarmer:** fast, melee only, weak, low HP. Spawns in groups and is the group-pressure enemy.

**Bosses (3 total, one per dungeon)**
1. **Boss 1:** a larger slow, tanky enemy that shoots **bombs**. Bombs explode and **spawn Swarmers** from the blast.
2. **Boss 2:** *design left to the agent.* Constraints: must introduce a distinct pattern from boss 1 (suggestion: a fast-moving boss with bullet-ring/spiral patterns, since this is a bullet hell), have at least two phases, and be configurable entirely via `config.js`.
3. **Boss 3:** *design left to the agent.* Constraints: should combine and escalate prior mechanics (suggestion: adds, ring patterns, and a charge/dash attack), have at least three phases, and be the hardest fight.
Document the boss 2 and 3 designs you chose in the README.

---

### Procedural dungeon, grid, and virtualization
- **Seeded generation** (shared seed so multiplayer peers produce identical dungeons). Rooms + corridors, with a start room, a boss room, and loot/enemy placement per room. Three dungeons in campaign order, plus endless mode.
- **Spatial grid:** divide the world into cells (size in config). All entities register in a cell. Used for neighbor queries, broad-phase collision, and virtualization.
- **Sim distance system (two or three tiers, all radii in config):**
  - **Active:** full simulation, full DOM, collision enabled.
  - **Near-inactive:** reduced sim (e.g. updates every N frames, simplified AI), DOM kept, collision off or coarse.
  - **Far / dormant:** simulation paused, **DOM element removed or detached** (returned to pool), state kept as plain data so it can be rematerialized when the player approaches. Enemies are rematerialized from stored dataset-like records.
- Walls follow the same virtualization (only wall elements near the camera exist in the DOM).
- The world container moves via a single `transform` (camera). Document how collision coordinates handle the camera (recommended: all entities are in world container space and compare rects in the same viewport space within a frame, never caching across camera moves unless the camera is static).
- **Minimap:** `<bh-minimap>` shows the **full dungeon layout** (static layer drawn once per dungeon), with explored/unexplored shading, plus live dots for the player(s), bosses, and optionally enemies/loot. A `<canvas>` inside the minimap element is acceptable here since it isn't part of the architecture under test. Keep it in the same module file as the element.

---

### Collision modes (the thing under test)
Implement collision as a swappable strategy selectable at runtime from the dev menu:

1. **`gbcr` (default, the "intuitive" path):** broad-phase via the spatial grid to pick candidate pairs, then `getBoundingClientRect` on candidates for narrow-phase. Follow batched order: write all transforms, then do all reads.
2. **`gbcr-naive`:** no grid broad-phase and interleaved write/read per entity. This is the worst-case pattern to demonstrate the cost.
3. **`math`:** pure-JS AABB/circle math on cached logical positions, with a single transform write per entity per frame. This is the control.

Document known caveats in code comments where they apply: rotated-element inflated boxes, tunneling for fast bullets (include swept/segment check optionally behind a config flag), and animated transforms returning interpolated positions (so all entity motion should be driven by JS per-frame, not CSS transitions, for entities that collide).

---

### Config file and dev menu
- **`config.js`** exports one object (or frozen groups) containing: player stats, stamina costs/regen, dash params, weapon stats and speed penalties, item params, enemy and boss stats and patterns, spawn rates and room density, grid cell size, sim tier radii, collision mode, pool sizes, network settings (STUN servers, tick rate, interpolation delay), and debug flags.
- **`<bh-dev-menu>`**, toggled with `~`: auto-generates controls from the config (numbers -> sliders/inputs, booleans -> toggles, enums -> selects), edits values live, and supports export/import of the config as JSON. Pause-on-open is a toggle. Include action buttons (see stress tests).

### Stress-test and instrumentation requirements
This is the core deliverable. Provide `<bh-perf>` overlay (toggle in dev menu) showing:
- FPS, frame time (avg / p95 / max), and a small frame-time graph.
- Per-system timings per frame: input, AI, movement/transform writes, collision (broken into grid query / gBCR / resolve), virtualization, render-side dataset updates, networking.
- Counters: total entities, active/near/dormant counts, DOM node count, collision pair checks per frame, gBCR calls per frame, pool hits/misses, bullets alive.
- Use `performance.now()` and `performance.mark/measure` so traces also show in the DevTools Performance panel.

Dev menu stress actions and toggles:
- **Spawn N bullets** (100 / 500 / 1000 / 5000) in patterns (ring, spiral, random).
- **Spawn N enemies** of any type; a **boss rush** button.
- **Bullet storm mode:** continuous spawners with configurable rate.
- **Collision mode switch** (gbcr / gbcr-naive / math) live.
- **Virtualization on/off** and tier radii live.
- **Pooling on/off.**
- **Attribute-selector test:** toggle a stylesheet variant that uses `[data-state=...]` selectors on per-frame-written props vs. class toggles.
- **Dataset write mode:** write dataset every frame vs. only on change vs. keep hot state in JS fields and sync dataset lazily.
- **Render target test:** option to render bullets as individual DOM elements (default) versus all bullets in one `<svg>` versus (as a control only) a single canvas layer, to compare.
- An **auto-benchmark** button: ramps entity count over time while recording frame time, and reports the entity count at which p95 frame time exceeds 16.7 ms, per collision mode. Output results as a table and downloadable JSON.

Write a short `RESULTS.md` template the agent fills in after running benchmarks: device, browser, mode, threshold counts, and the first bottleneck observed in the profiler.

---

### Multiplayer (experimental, behind a config flag and a menu entry)
Over **WebRTC data channels**, with **manual signaling**: no server.

**Handshake UI (`<bh-signaling>`)**
- Host clicks "Host": creates `RTCPeerConnection` + data channel, creates an offer, **waits for ICE gathering to complete** (so candidates are included in the SDP), then shows the SDP as a **base64-encoded string** in a textarea with a Copy button.
- Guest clicks "Join": pastes the host's string, decodes it, sets the remote description, creates an answer, waits for ICE gathering, and shows the base64 answer to copy back.
- Host pastes the answer and completes the connection. Show clear connection status and errors (bad paste, timeout, ICE failure). Use `btoa`/`atob` with proper UTF-8 handling; optionally JSON-wrap `{type, sdp}` before encoding.
- STUN server list in config (public STUN by default, empty list for LAN-only).

**Modes**
- **Co-op PvE:** both players in the same dungeon vs. enemies and bosses. Host-authoritative: the host simulates enemies, projectiles, and loot, and sends snapshots. The guest sends inputs and does simple client-side prediction for its own movement. Both share the seed so the dungeon is generated locally and identically. Virtualization must consider **both** players' positions when deciding what to simulate.
- **PvP:** a small arena (or a dungeon room set) where players shoot each other. Same host-authoritative model. Items such as mines and shields should work against the other player. Infinite ammo applies, so balance via fire rate and stamina.
- Sync strategy: fixed tick (config), delta/compact snapshots, interpolation buffer for remote entities, entity IDs in `dataset`. Remote entities are the same custom elements driven by snapshots instead of local AI.
- Show ping/RTT in the perf overlay. Label the feature clearly as experimental and handle disconnects gracefully (fall back to single-player).

---

### Deliverables
1. Working game runnable from a static server (`npx serve` or `python -m http.server`), documented in `README.md`.
2. The file structure above, honoring the "behavior local to the module" rule.
3. `config.js` driving everything, plus the `~` dev/config menu.
4. Instrumentation, the stress tests, and the auto-benchmark.
5. `README.md` covering controls, architecture, how to run each stress test, the boss 2/3 designs, and known limitations.
6. `RESULTS.md` template (filled in if you were able to run benchmarks).

### Priorities if time is limited
1. Core loop, player movement, stamina, one weapon, standard enemy, pooled bullets, `gbcr` collision, perf overlay.
2. Grid + virtualization + minimap + dev menu/config.
3. All enemies, weapons, items, bosses, dungeon progression, endless mode.
4. Stress tests and auto-benchmark (do not leave these to last, since they're the point of the PoC).
5. Multiplayer (experimental, last).
