# Bullet Hell PoC

A top-down bullet hell game built on an intentionally "intuitive" DOM
architecture. The goal is a stress test. The game makes the architecture
bottlenecks measurable and attributable.

## What is under test

Each entity is a custom element. State lives in `dataset`. All motion uses CSS
`transform`. Collision uses `getBoundingClientRect` as the primary path. The
perf overlay and the auto-benchmark show where this architecture breaks.

## Run it

You need a static server, because the game uses ES modules.

1. Open a terminal in this folder.
2. Start a server. Use one of these:
   - `python3 -m http.server 8000`
   - `npx serve`
3. Open the shown URL in a browser. For `python3`, open `http://localhost:8000`.
4. Click the page once so the browser gives keyboard focus.

Chrome or a Chromium browser gives the best DevTools traces.

## Controls

| Input | Action |
|---|---|
| WASD | Move |
| Mouse | Aim |
| Left click | Fire (hold for automatic weapons) |
| Shift | Sprint (drains stamina while moving) |
| Space | Dash (costs stamina, short cooldown, brief i-frames) |
| Q / E | Cycle item slots |
| F | Use the active item |
| 1-4 | Select an owned weapon |
| ~ | Open the dev/config menu |
| P | Toggle the perf overlay |
| Enter | Restart after death, or start endless mode after the campaign |

Ammo is infinite. Fire rate is the limiter.

## Architecture

- **Entities are custom elements** (`bh-player`, `bh-bullet`, `bh-enemy` types,
  and so on). No Shadow DOM.
- **State lives in `dataset`**. Typed getters and setters wrap the string
  storage. Hot logical state also lives in JS fields for speed. The dataset
  write mode is a toggle (see stress tests).
- **Motion uses `transform` only** (`translate3d`, `rotate`, `scale`). The code
  never animates `left`, `top`, `width`, `height`, or `margin`. `will-change:
  transform` is set only on long-lived entities (player, enemies), not bullets.
- **The camera is one transform** on the world container. Every entity lives in
  world space. So every `getBoundingClientRect` value is in the same viewport
  space within a frame. The code never caches rects across camera moves.
- **Behavior is local to the module.** Each element class, its template, and its
  CSS live in one file. Each class injects its `<style>` once with a static
  `ensureStyles()`. The only global CSS is a small reset in `index.html`.
- **Everything tunable is in `config.js`**. The dev menu reads and writes it.

### File structure

```
index.html        main.js        config.js
core/   entity, pool, rng, input, loop-profiler, game
world/  dungeon, grid, virtualizer, wall, camera
player/ player, stamina
weapons/ weapon, pistol, smg, shotgun, sniper
projectiles/ bullet, grenade, bomb, explosion
enemies/ enemy, standard, tank, swarmer
bosses/ boss, boss1, boss2, boss3
items/  item, health-potion, speed-elixir, proximity-mine, bubble-shield, loot
collision/ collision, gbcr-collision, math-collision
net/    peer, signaling-ui, netcode
ui/     hud, minimap, dev-menu, perf-overlay
```

## Collision modes

Switch the mode live from the dev menu. Three modes exist:

1. **`gbcr`** (default): the grid picks candidate pairs (broad-phase). Then the
   code reads all `getBoundingClientRect` values once and compares them. This
   follows the "write all, then read all" order.
2. **`gbcr-naive`**: no grid broad-phase. The code reads `getBoundingClientRect`
   per pair during the check. This is the worst-case pattern.
3. **`math`**: pure JS circle math on cached logical positions. This is the
   control.

### Known caveats (also noted in code)

- `getBoundingClientRect` on a rotated element returns an inflated axis-aligned
  box. Bullets do not rotate for collision.
- `getBoundingClientRect` is viewport-space. Camera moves invalidate cached
  rects. The camera is a parent transform, so all rects stay in one space per
  frame.
- A CSS-driven transform makes `getBoundingClientRect` return the interpolated
  position. So every colliding entity moves by JS per frame, never by a CSS
  transition.
- Fast bullets can tunnel through thin walls. Bullet-vs-wall uses a tile lookup,
  which is stable at tile size. A swept check sits behind `collision.sweptBullets`.
- The SVG and canvas bullet render targets have no per-bullet element. So the
  collision system falls back to math narrow-phase for bullets in those modes.

## Stress tests and instrumentation

Open the dev menu with `~`. The perf overlay (toggle `P` or the menu button)
shows:

- FPS, frame time (avg / p95 / max), and a frame-time graph with a 16.7 ms line.
- Per-system timings per frame: player, AI, projectiles, bullets, transform,
  collision (split into grid / gBCR / resolve / contact), virtualize, render, net.
- Counters: entities, active/near/dormant counts, DOM node count, pair checks,
  gBCR calls, pool hits/misses, bullets alive, and net RTT.

The profiler uses `performance.now()` and `performance.mark/measure`. So the
traces also show in the DevTools Performance panel.

Dev menu actions and toggles:

- **Spawn N bullets** (100 / 500 / 1000 / 5000) as a ring, spiral, or random.
- **Spawn N enemies** of each type, plus a **boss rush** button.
- **Bullet storm**: a continuous spawner.
- **Collision mode** switch (gbcr / gbcr-naive / math), live.
- **Virtualization** on/off and tier radii, live (in the `sim` config group).
- **Pooling** on/off (`pool.enabled`).
- **Attribute-selector test** (`render.attributeSelectorTest`): use
  `[data-state=...]` selectors on hot props instead of class toggles.
- **Dataset write mode** (`render.datasetWriteMode`): `everyFrame`, `onChange`,
  or `lazy`.
- **Render target** (`render.bulletTarget`): `dom`, `svg`, or `canvas`.
- **Auto-benchmark**: ramps the bullet count per collision mode. It reports the
  count where p95 frame time first passes 16.7 ms. It shows a table and a
  download of the JSON.

Fill in `RESULTS.md` after a benchmark run.

## Gameplay

- Three campaign dungeons, each with a boss. The dungeon is seeded, so networked
  peers build the same map.
- One new gun drops after each boss: SMG, then shotgun, then sniper. The player
  starts with the pistol. The order is in `config.progression.unlockOrder`.
- After the three bosses, press Enter for **endless mode**. Floors scale in
  difficulty and bosses recycle with more HP.
- Three item slots, one active. Q/E cycles, F uses. Items: health potion, speed
  elixir, proximity mine, and bubble shield.
- The bubble shield blocks bullets that cross the boundary from outside. Enemies
  and players walk through it. Enemy bullets chip its HP. A bullet already
  inside passes freely.

### Weapons

| Weapon | Notes | Move penalty |
|---|---|---|
| Pistol | Starter, semi-auto | 0% |
| SMG | High fire rate, low damage, spread, automatic | 5% |
| Shotgun | Multi-pellet cone, short range | 10% |
| Sniper | Slow, high damage, piercing, visible laser sight | 15% |

The penalty applies to base and sprint speed. It does not apply to dash. The
sniper laser is a styled element. It rotates along the aim and stops at the
first wall, found by a tile raycast.

### Enemies

- **Standard**: approaches, keeps range, fires bullets, heavy contact damage.
- **Tank**: slow, high HP, fires arcing grenades that explode with area damage.
- **Swarmer**: fast, weak, melee only. Spawns in groups. The pressure enemy.

### Bosses

- **Boss 1 — The Brood Mortar**: a large, slow, tanky enemy. It shoots bombs.
  Each bomb explodes and spawns swarmers from the blast.
- **Boss 2 — The Carousel** (my design): a fast boss built on ring and spiral
  patterns.
  - Phase 1 (above 50% HP): the boss orbits the player and fires expanding
    rings on a slow cadence. The rhythm is readable.
  - Phase 2 (at or below 50% HP): the rings continue, and two rotating spiral
    arms sweep the arena. The pressure comes from pattern density, not raw speed.
- **Boss 3 — The Warden** (my design): the hardest fight. It combines and
  escalates the earlier mechanics across three phases.
  - Phase 1 (above 66% HP): steady expanding rings while it keeps range.
  - Phase 2 (66% to 33% HP): the rings continue, and the boss spawns swarmer
    adds to split the player's attention.
  - Phase 3 (below 33% HP): the boss adds a telegraphed charge. It locks the
    player direction, flashes a warning, then dashes for heavy contact damage,
    on top of the rings and the adds.

Every boss stat and pattern lives in `config.bosses`.

## Procedural dungeon and virtualization

- Generation is seeded (rooms plus corridors, a start room, a boss room, and
  per-room enemy placement). The wall tiles merge into rectangles to cut the
  collider count.
- A spatial grid splits the world into cells. It drives broad-phase collision
  and neighbor queries.
- Sim-distance tiers use the nearest player, so co-op counts both players:
  - **Active**: full sim, full DOM, collision on.
  - **Near**: reduced sim (updates every `sim.nearStride` frames), DOM kept.
  - **Dormant**: sim paused. The DOM element detaches and returns to a pool. The
    state stays in JS fields and `dataset`, so the entity rematerializes on
    approach.
- Walls follow the same rule. Only walls near the camera exist in the DOM.
- The minimap shows the full dungeon layout, drawn once on a canvas, with
  explored shading. It also shows live dots for the player, the boss, and loot.
  The canvas is acceptable here, because the minimap is not part of the
  architecture under test.

## Multiplayer (experimental)

Multiplayer runs over WebRTC data channels with manual signaling. There is no
server. Open it from the dev menu button "Multiplayer…".

1. The host clicks **Host**. The app creates an offer and waits for ICE
   gathering. It shows a base64 code.
2. The host copies the code and sends it to the guest.
3. The guest pastes the code and clicks **Join**. The app shows a base64 answer.
4. The guest sends the answer back. The host pastes it and clicks **Connect**.

The host simulates everything and sends snapshots at the tick rate. The guest
sends input. Both peers use a fixed slot map: `players[0]` is the host avatar
and `players[1]` is the guest avatar. The local input drives the local slot.

The host integrates the guest input every frame at real `dt`, so the guest
avatar moves at full speed. The guest interpolates the host avatar and the
enemies toward the latest snapshot, so motion stays smooth between snapshots.
The guest also predicts its own movement and corrects only on a large error.
The RTT shows in the perf overlay. On a disconnect, the game falls back to
single-player.

This layer is experimental. It demonstrates the transport, the slot map, input
integration, and interpolation.

## Spectator cast to a TV (experimental)

The host can cast a spectator view to a TV with the Presentation API. The TV
watches the host. The TV is not a player and never sends input.

1. Open the dev menu with `~`.
2. Click **Cast to TV (spectator)**.
3. Choose a screen in the browser picker.

The browser opens `receiver.html` on the chosen screen. The host uses the
presentation connection only for signaling. It sends the SDP as a base64 blob,
the same wrapping as the manual multiplayer handshake. After the handshake, the
host opens a WebRTC data channel and streams the game state to the TV.

The TV draws the world on a canvas: walls from the seeded dungeon, players,
enemies, bullets, and the boss. The host also streams the FPS and the
performance data. So the TV keeps the FPS counter and the performance graph.

Notes:

- The feature needs a browser with the Presentation API, such as Chrome.
- A real cast device, like a Chromecast, loads the receiver page from the
  origin. So the origin must be reachable by the device (an https URL, or a
  cast of the browser tab). A second screen on the same machine also works.
- The stream caps the bullet count per snapshot (`config.cast.maxBullets`) to
  limit bandwidth.

### TV render path (canvas vs DOM)

The TV draws the spectator view in one of two ways. Set
`config.cast.receiverRender` on the host, or press R on the receiver to toggle.

| Path | How it draws | Use |
|---|---|---|
| `canvas` | One canvas, all shapes each frame | Default. Cheap on a weak cast device. |
| `dom` | The host architecture: a camera transform on a world container, with pooled DOM elements positioned by transform | Compare the DOM render path on a second device. |

The host sends the chosen path in every snapshot, so the TV switches live. The
perf overlay shows the path in its counters, next to the FPS and the graph. So
you can compare the frame cost of canvas and DOM on the same spectator device.

## Known limitations

- Enemy-vs-enemy and enemy-vs-wall overlap resolution is simple. Enemies can
  stack.
- Bullet-vs-wall uses a tile lookup, not a swept test, unless you set
  `collision.sweptBullets`.
- The multiplayer layer syncs player and enemy positions, not bullets. So the
  guest does not see enemy fire. The guest also skips collision, because the
  host holds authority. Co-op is playable, not competitive-grade.
- The attribute-selector test applies a class on the body. The stylesheet cost
  depends on the browser.
- The SVG and canvas bullet modes disable gBCR collision for bullets by design.

## Credits

Built as a proof of concept to measure a DOM-first game architecture.
