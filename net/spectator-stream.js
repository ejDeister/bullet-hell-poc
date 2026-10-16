// net/spectator-stream.js
// Shared builders for the spectator stream. Both senders use these: the
// Presentation sender (cast.js) and the Cast Custom Receiver sender
// (cast-sender.js). The messages carry the world state plus the host FPS and
// the performance data, so the TV shows the game and the perf graph.

import { CONFIG } from '../config.js';

export function buildInit(game) {
  return {
    t: 'init',
    seed: CONFIG.world.seed,
    dungeonIndex: game.dungeonIndex,
    endless: game.endless,
    render: CONFIG.cast.receiverRender,
  };
}

// extra: object merged into the perf counters (for example, channel stats).
export function buildSnapshot(game, extra) {
  const cam = game.camera;

  const players = game.players
    .filter(p => p && !p.dead)
    .map(p => [Math.round(p.x), Math.round(p.y), Math.round(p.hp), p.maxHp, +p.aim.toFixed(2)]);

  const enemies = [];
  for (const e of game.enemies) {
    if (e.dead || e.isBoss) continue;
    enemies.push([Math.round(e.x), Math.round(e.y), e.kind]);
  }

  let boss = null;
  if (game.activeBoss && !game.activeBoss.dead) {
    const b = game.activeBoss;
    boss = [Math.round(b.x), Math.round(b.y), +b.hpFrac.toFixed(3), b.name || 'BOSS', b.radius];
  }

  const bullets = [];
  if (CONFIG.cast.streamBullets) {
    const list = game.bullets.list;
    const max = Math.min(list.length, CONFIG.cast.maxBullets);
    for (let i = 0; i < max; i++) {
      const b = list[i];
      bullets.push(Math.round(b.x), Math.round(b.y), b.faction === 'enemy' ? 1 : 0);
    }
  }

  return {
    t: 'snap',
    render: CONFIG.cast.receiverRender,
    cam: [Math.round(cam.x), Math.round(cam.y), cam.viewW, cam.viewH],
    score: game.score,
    label: game.dungeonLabel(),
    players, enemies, boss, bullets,
    perf: buildPerf(game, extra),
  };
}

function buildPerf(game, extra) {
  const prof = game.profiler;
  const ft = prof.frameTimes;
  const trimmed = ft.slice(-60).map(v => Math.round(v * 10) / 10);
  const roundObj = (o) => { const r = {}; for (const k in o) r[k] = Math.round((o[k] + Number.EPSILON) * 100) / 100; return r; };
  return {
    fps: Math.round(prof.fps),
    maxSamples: prof.maxSamples,
    stats: prof.stats(),
    frameTimes: trimmed,
    systems: roundObj(prof.systems),
    counters: { ...prof.counters, ...game._extraCounters(), ...(extra || {}) },
  };
}
