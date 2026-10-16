// world/grid.js
// Spatial hash grid for broad-phase collision, neighbor queries, and
// virtualization. Entities register by world position each frame (rebuilt).

import { CONFIG } from '../config.js';

export class Grid {
  constructor(cellSize = CONFIG.grid.cellSize) {
    this.cellSize = cellSize;
    this.cells = new Map();   // key "cx,cy" -> array of entities
  }

  _key(cx, cy) { return cx + ',' + cy; }

  clear() {
    this.cells.clear();
  }

  // Rebuild from scratch each frame. Cheap vs. incremental for our scale and
  // avoids stale-cell bugs.
  rebuild(entities) {
    this.clear();
    const cs = this.cellSize;
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (!e.alive) continue;
      const cx = Math.floor(e.x / cs);
      const cy = Math.floor(e.y / cs);
      const key = this._key(cx, cy);
      let arr = this.cells.get(key);
      if (!arr) { arr = []; this.cells.set(key, arr); }
      arr.push(e);
      e._cx = cx; e._cy = cy;
    }
  }

  // Candidate neighbors in the 3x3 block around (x, y).
  neighbors(x, y, out = []) {
    out.length = 0;
    const cs = this.cellSize;
    const cx = Math.floor(x / cs);
    const cy = Math.floor(y / cs);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const arr = this.cells.get(this._key(cx + dx, cy + dy));
        if (arr) for (let i = 0; i < arr.length; i++) out.push(arr[i]);
      }
    }
    return out;
  }

  // Unique candidate pairs within neighboring cells, for broad-phase collision.
  // Calls cb(a, b) for each candidate pair whose factions differ via filter.
  forEachPair(cb) {
    // For each cell, pair its members with members of this + the 4 "forward"
    // neighbor cells to avoid double counting.
    const forward = [ [0,0], [1,0], [-1,1], [0,1], [1,1] ];
    for (const [key, arr] of this.cells) {
      const [cx, cy] = key.split(',').map(Number);
      for (let f = 0; f < forward.length; f++) {
        const nkey = this._key(cx + forward[f][0], cy + forward[f][1]);
        const narr = this.cells.get(nkey);
        if (!narr) continue;
        const same = nkey === key;
        for (let i = 0; i < arr.length; i++) {
          const a = arr[i];
          const jStart = same ? i + 1 : 0;
          for (let j = jStart; j < narr.length; j++) {
            cb(a, narr[j]);
          }
        }
      }
    }
  }
}
