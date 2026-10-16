// world/dungeon.js
// Procedural dungeon generation: rooms + corridors on a tile grid, seeded so
// multiplayer peers produce identical maps. Produces floor tiles, wall segments
// (merged into rectangles for fewer colliders), a start room, a boss room, and
// per-room enemy/loot placement records.

import { CONFIG } from '../config.js';
import { RNG } from '../core/rng.js';

export const TILE = { WALL: 0, FLOOR: 1, DOOR: 2 };

export class Dungeon {
  // dungeonIndex: 0-based campaign floor; affects difficulty + seed offset.
  constructor(seed, dungeonIndex = 0) {
    this.index = dungeonIndex;
    this.rng = new RNG((seed + dungeonIndex * 7919) >>> 0);
    this.size = CONFIG.world.mapTiles;
    this.ts = CONFIG.world.tileSize;
    this.map = new Uint8Array(this.size * this.size); // all WALL initially
    this.rooms = [];
    this.wallRects = []; // merged wall rectangles in world px {x,y,w,h}
    this.startRoom = null;
    this.bossRoom = null;
    this.generate();
  }

  idx(tx, ty) { return ty * this.size + tx; }
  inBounds(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.size && ty < this.size; }
  tileAt(tx, ty) { return this.inBounds(tx, ty) ? this.map[this.idx(tx, ty)] : TILE.WALL; }

  // World px -> tile.
  worldToTile(wx, wy) {
    return { tx: Math.floor(wx / this.ts), ty: Math.floor(wy / this.ts) };
  }
  tileCenterWorld(tx, ty) {
    return { x: tx * this.ts + this.ts / 2, y: ty * this.ts + this.ts / 2 };
  }

  generate() {
    const { roomMin, roomMax, roomCount, corridorWidth } = CONFIG.world;
    const rng = this.rng;
    const placed = [];
    let attempts = 0;
    while (placed.length < roomCount && attempts < roomCount * 20) {
      attempts++;
      const w = rng.int(roomMin, roomMax);
      const h = rng.int(roomMin, roomMax);
      const x = rng.int(1, this.size - w - 1);
      const y = rng.int(1, this.size - h - 1);
      const room = { x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) };
      // Reject overlaps (with 1-tile margin).
      const overlaps = placed.some(r =>
        x < r.x + r.w + 1 && x + w + 1 > r.x &&
        y < r.y + r.h + 1 && y + h + 1 > r.y);
      if (overlaps) continue;
      placed.push(room);
      this.carveRoom(room);
    }
    this.rooms = placed;

    // Connect rooms in placement order with L-shaped corridors.
    for (let i = 1; i < placed.length; i++) {
      this.carveCorridor(placed[i - 1], placed[i], corridorWidth);
    }

    // Start room = first; boss room = farthest from start.
    this.startRoom = placed[0];
    let best = null, bestD = -1;
    for (let i = 1; i < placed.length; i++) {
      const d = Math.hypot(placed[i].cx - this.startRoom.cx, placed[i].cy - this.startRoom.cy);
      if (d > bestD) { bestD = d; best = placed[i]; }
    }
    this.bossRoom = best || placed[placed.length - 1];

    this.buildWallRects();
    this.placeSpawns();
  }

  carveRoom(r) {
    for (let ty = r.y; ty < r.y + r.h; ty++)
      for (let tx = r.x; tx < r.x + r.w; tx++)
        this.map[this.idx(tx, ty)] = TILE.FLOOR;
  }

  carveCorridor(a, b, width) {
    const w = Math.max(1, width);
    const carveH = (x0, x1, y) => {
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
        for (let d = 0; d < w; d++)
          if (this.inBounds(x, y + d)) this.map[this.idx(x, y + d)] = TILE.FLOOR;
    };
    const carveV = (y0, y1, x) => {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
        for (let d = 0; d < w; d++)
          if (this.inBounds(x + d, y)) this.map[this.idx(x + d, y)] = TILE.FLOOR;
    };
    if (this.rng.chance(0.5)) {
      carveH(a.cx, b.cx, a.cy);
      carveV(a.cy, b.cy, b.cx);
    } else {
      carveV(a.cy, b.cy, a.cx);
      carveH(a.cx, b.cx, b.cy);
    }
  }

  // Merge contiguous wall tiles into horizontal run rectangles. We only keep
  // wall tiles that border a floor (the visible/collidable shell) to cut count.
  buildWallRects() {
    const ts = this.ts;
    const isBorderWall = (tx, ty) => {
      if (this.tileAt(tx, ty) !== TILE.WALL) return false;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if ((dx || dy) && this.tileAt(tx + dx, ty + dy) === TILE.FLOOR) return true;
      return false;
    };
    this.wallRects = [];
    for (let ty = 0; ty < this.size; ty++) {
      let runStart = -1;
      for (let tx = 0; tx <= this.size; tx++) {
        const solid = tx < this.size && isBorderWall(tx, ty);
        if (solid && runStart === -1) runStart = tx;
        if (!solid && runStart !== -1) {
          this.wallRects.push({
            x: runStart * ts, y: ty * ts,
            w: (tx - runStart) * ts, h: ts,
          });
          runStart = -1;
        }
      }
    }
  }

  // Enemy/loot placement records per room (plain data; materialized later).
  placeSpawns() {
    const rng = this.rng;
    const sp = CONFIG.spawn;
    for (const room of this.rooms) {
      room.spawns = [];
      room.isStart = room === this.startRoom;
      room.isBoss = room === this.bossRoom;
      room.cleared = room.isStart; // start room is safe
      if (room.isStart) continue;
      if (room.isBoss) continue; // boss spawned separately

      const count = rng.int(sp.enemiesPerRoomMin, sp.enemiesPerRoomMax);
      for (let i = 0; i < count; i++) {
        const tx = rng.int(room.x + 1, room.x + room.w - 2);
        const ty = rng.int(room.y + 1, room.y + room.h - 2);
        let type = 'standard';
        if (rng.chance(sp.swarmerGroupChance)) type = 'swarmer';
        else if (rng.chance(sp.tankChance)) type = 'tank';
        const pos = this.tileCenterWorld(tx, ty);
        room.spawns.push({ type, x: pos.x, y: pos.y, spawned: false });
      }
    }
  }

  // Bounds of the boss room in world px.
  bossRoomWorld() {
    const r = this.bossRoom;
    return {
      x: r.x * this.ts, y: r.y * this.ts,
      w: r.w * this.ts, h: r.h * this.ts,
      cx: r.cx * this.ts + this.ts / 2, cy: r.cy * this.ts + this.ts / 2,
    };
  }

  startWorld() {
    return this.tileCenterWorld(this.startRoom.cx, this.startRoom.cy);
  }
}
