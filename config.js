// config.js
// Single source of truth. No magic numbers in modules; everything tunable lives here.
// The dev menu (~) auto-generates controls from this object and can export/import it.
//
// Structure note: values are grouped. Numbers become sliders/inputs, booleans
// become toggles, and the string enums listed in CONFIG_ENUMS become selects.

export const CONFIG = {
  world: {
    tileSize: 48,            // px per dungeon tile in world space
    seed: 1337,              // shared seed (multiplayer peers must match)
    roomMin: 6,              // min room size in tiles
    roomMax: 14,             // max room size in tiles
    roomCount: 10,           // target rooms per dungeon
    mapTiles: 96,            // dungeon is mapTiles x mapTiles
    corridorWidth: 2,
  },

  camera: {
    lerp: 0.15,              // camera follow smoothing (0..1)
    deadzone: 0,             // px of dead zone before camera moves
  },

  grid: {
    cellSize: 160,           // spatial grid cell size in world px (broad-phase)
  },

  sim: {
    // Sim-distance tiers. Radii are in world px from the nearest player.
    activeRadius: 900,       // full sim, full DOM, collision on
    nearRadius: 1500,        // reduced sim (updates every nearStride frames), DOM kept, collision coarse
    nearStride: 4,           // near-inactive entities update once every N frames
    // Beyond nearRadius: dormant. DOM detached/pooled, state kept as plain data.
    virtualizeWalls: true,   // only near-camera walls exist in the DOM
    wallRadius: 1100,        // wall materialization radius (world px)
  },

  player: {
    radius: 14,              // collision radius (px)
    baseSpeed: 260,          // px/sec
    maxHp: 100,
    contactIFrames: 0.6,     // seconds of invulnerability after taking contact damage
    startWeapon: 'pistol',
  },

  stamina: {
    max: 100,
    regenPerSec: 22,
    regenDelay: 0.8,         // seconds after last use before regen starts
    sprintDrainPerSec: 28,
    sprintMultiplier: 1.6,   // speed multiplier while sprinting
    dashCost: 35,
    dashSpeed: 1100,         // px/sec during dash
    dashDuration: 0.14,      // seconds
    dashCooldown: 0.5,       // seconds
    dashIFrames: true,       // brief invulnerability during dash
  },

  weapons: {
    // speedPenalty is a fraction of base/sprint speed removed while held (not dash).
    pistol:  { fireRate: 4,  damage: 14, speed: 620, spread: 0.02, pellets: 1, speedPenalty: 0.00, auto: false, bulletRadius: 5,  life: 1.4, pierce: 0 },
    smg:     { fireRate: 13, damage: 6,  speed: 700, spread: 0.12, pellets: 1, speedPenalty: 0.05, auto: true,  bulletRadius: 4,  life: 1.1, pierce: 0 },
    shotgun: { fireRate: 1.4,damage: 7,  speed: 560, spread: 0.30, pellets: 9, speedPenalty: 0.10, auto: false, bulletRadius: 5,  life: 0.5, pierce: 0 },
    sniper:  { fireRate: 0.9,damage: 70, speed: 1400,spread: 0.00, pellets: 1, speedPenalty: 0.15, auto: false, bulletRadius: 4,  life: 1.8, pierce: 3, laser: true },
  },

  // One new gun per dungeon, dropped after the boss. Index = dungeon number - 1.
  progression: {
    unlockOrder: ['smg', 'shotgun', 'sniper'],
    dungeons: 3,
    endlessAfterCampaign: true,
  },

  items: {
    slots: 3,
    healthPotion: { heal: 40 },
    speedElixir:  { multiplier: 1.5, duration: 6 },
    proximityMine:{ armDelay: 0.8, radius: 90, damage: 120, life: 20 },
    bubbleShield: { radius: 120, hp: 300, life: 12 },
    startItems: ['healthPotion', 'speedElixir', 'proximityMine', 'bubbleShield'],
  },

  enemies: {
    standard: { hp: 30,  radius: 16, speed: 120, contactDamage: 12, fireRate: 1.1, bulletSpeed: 240, bulletDamage: 8,  range: 520, score: 10 },
    tank:     { hp: 160, radius: 26, speed: 55,  contactDamage: 18, fireRate: 0.5, grenadeSpeed: 300, grenadeDamage: 26, grenadeRadius: 110, range: 620, score: 30 },
    swarmer:  { hp: 8,   radius: 11, speed: 230, contactDamage: 7,  score: 5, groupSize: 6 },
  },

  bosses: {
    boss1: { hp: 1200, radius: 46, speed: 48, contactDamage: 24, bombFireRate: 0.6, bombSpeed: 220, bombRadius: 130, bombDamage: 20, swarmersPerBomb: 4 },
    boss2: {
      hp: 1600, radius: 40, speed: 170, contactDamage: 22,
      // Phase 1: ring burst. Phase 2 (<50% hp): faster spiral + rings.
      phase2HpFrac: 0.5,
      ringCount: 24, ringSpeed: 200, ringFireRate: 1.0, ringDamage: 9,
      spiralCount: 3, spiralSpeed: 260, spiralFireRate: 18, spiralDamage: 7, spiralRotSpeed: 2.4,
    },
    boss3: {
      hp: 2600, radius: 50, speed: 120, contactDamage: 28,
      // 3 phases by hp fraction. Combines rings, adds, and a charge/dash.
      phase2HpFrac: 0.66, phase3HpFrac: 0.33,
      ringCount: 30, ringSpeed: 230, ringFireRate: 1.2, ringDamage: 10,
      addsEvery: 6, addsCount: 5,
      chargeSpeed: 900, chargeTelegraph: 0.7, chargeDamage: 40, chargeEvery: 4,
    },
  },

  spawn: {
    enemiesPerRoomMin: 2,
    enemiesPerRoomMax: 6,
    swarmerGroupChance: 0.35,
    tankChance: 0.25,
  },

  collision: {
    mode: 'gbcr',            // 'gbcr' | 'gbcr-naive' | 'math'
    sweptBullets: false,     // optional swept/segment check to prevent tunneling
  },

  pool: {
    enabled: true,
    bulletInitial: 512,
    maxBulletsAlive: 6000,   // hard cap safety valve
  },

  render: {
    bulletTarget: 'dom',     // 'dom' | 'svg' | 'canvas'  (render-target stress test)
    datasetWriteMode: 'onChange', // 'everyFrame' | 'onChange' | 'lazy'
    attributeSelectorTest: false, // use [data-state=...] selectors on hot props
    pauseOnDevMenu: true,
  },

  net: {
    enabled: false,
    stunServers: ['stun:stun.l.google.com:19302'],
    tickRate: 30,            // sim snapshots per second
    interpDelayMs: 100,      // interpolation buffer for remote entities
    mode: 'coop',            // 'coop' | 'pvp'
  },

  // Spectator cast (experimental). The host opens a receiver page on a TV with
  // the Presentation API, uses that connection for WebRTC signaling, then
  // streams the game state over a WebRTC data channel. The TV is a spectator,
  // not a player.
  cast: {
    receiverPath: 'receiver.html', // same-origin receiver page URL
    tickRate: 20,                  // spectator snapshots per second
    streamBullets: true,
    maxBullets: 1500,              // cap bullets sent per snapshot (bandwidth)
    stunServers: ['stun:stun.l.google.com:19302'],
    receiverRender: 'canvas',      // 'canvas' | 'dom' — TV render path (comparison)
    // Google Cast Custom Receiver (runs YOUR page on the Chromecast's browser).
    // Fill appId after you register the receiver in the Cast Developer Console.
    appId: '',                     // Cast Application ID, e.g. 'ABCD1234'
    namespace: 'urn:x-cast:com.bullethell.spectate', // custom message channel
  },

  audio: {
    enabled: true,
    master: 0.6,       // master gain (0..1)
    sfx: 1.0,          // sfx level multiplier (0..1)
    maxVoices: 24,     // cap on simultaneous synth voices
  },

  debug: {
    showHitboxes: false,
    showGrid: false,
    godMode: false,
    logBenchmarks: true,
  },
};

// Which string keys are enums (the dev menu renders these as <select>).
export const CONFIG_ENUMS = {
  'collision.mode': ['gbcr', 'gbcr-naive', 'math'],
  'render.bulletTarget': ['dom', 'svg', 'canvas'],
  'render.datasetWriteMode': ['everyFrame', 'onChange', 'lazy'],
  'net.mode': ['coop', 'pvp'],
  'cast.receiverRender': ['canvas', 'dom'],
  'player.startWeapon': ['pistol', 'smg', 'shotgun', 'sniper'],
};

// Dotted-path get/set helpers so the dev menu and net sync can touch any value.
export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}
export function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const parent = keys.reduce((o, k) => (o[k] = o[k] || {}), obj);
  parent[last] = value;
}
