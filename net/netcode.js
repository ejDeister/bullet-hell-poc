// net/netcode.js
// Host-authoritative state sync over a Peer data channel.
//
//   - Host: simulates everything. Each tick it sends a compact snapshot of
//     entities (id, type, x, y, hp) plus both players. It receives guest input.
//   - Guest: sends its input every tick. It renders remote entities from
//     snapshots with an interpolation buffer, and does simple client-side
//     prediction for its own movement.
//
// This is an EXPERIMENTAL layer: it demonstrates the transport, the snapshot
// shape, interpolation, and input forwarding. It is intentionally simple.

import { CONFIG } from '../config.js';

export class Netcode {
  constructor(game, peer) {
    this.game = game;
    this.peer = peer;
    this.isHost = peer.isHost;
    this.tickInterval = 1000 / CONFIG.net.tickRate;
    this._acc = 0;
    this.remoteInput = { x: 0, y: 0, fire: false, aim: 0 };
    this.snapshotBuffer = []; // guest: [{t, entities}]
    peer.onMessage = (data) => this._onMessage(data);
  }

  update(dt) {
    this._acc += dt * 1000;
    if (this._acc < this.tickInterval) return;
    this._acc = 0;
    if (this.isHost) this._sendSnapshot();
    else this._sendInput();
  }

  // ---- host ------------------------------------------------------------
  _sendSnapshot() {
    const ents = [];
    for (const e of this.game.enemies) {
      if (e.dead) continue;
      ents.push([e.netId || (e.netId = ++this.game._netSeq), e.kind, Math.round(e.x), Math.round(e.y), Math.round(e.hp)]);
    }
    const players = this.game.players.map(p => p ? [Math.round(p.x), Math.round(p.y), Math.round(p.hp), +p.aim.toFixed(2)] : null);
    // Compact, bullets omitted for bandwidth (visual-only locally would need more).
    this.peer.send(JSON.stringify({ s: 1, t: performance.now(), e: ents, p: players }));
  }

  // ---- guest -----------------------------------------------------------
  _sendInput() {
    const inp = this.game.input;
    const mv = inp.moveVector();
    const p = this.game.players[this.game.localSlot]; // the guest's own avatar
    this.peer.send(JSON.stringify({ i: 1, x: mv.x, y: mv.y, fire: inp.mouse.down, aim: p ? p.aim : 0 }));
  }

  _onMessage(data) {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (msg.s) {
      // Snapshot (guest side): buffer for interpolation.
      this.snapshotBuffer.push({ t: performance.now(), data: msg });
      if (this.snapshotBuffer.length > 20) this.snapshotBuffer.shift();
      this.game.applyRemoteSnapshot(msg);
    } else if (msg.i) {
      // Input (host side): drive the guest's player.
      this.remoteInput = { x: msg.x, y: msg.y, fire: msg.fire, aim: msg.aim };
      this.game.applyRemoteInput(this.remoteInput);
    }
  }

  get rtt() { return this.peer.rtt; }
}
