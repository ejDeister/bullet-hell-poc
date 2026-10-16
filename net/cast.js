// net/cast.js
// Spectator cast (experimental). The host (controller) opens a receiver page on
// a TV with the Presentation API. It uses the PresentationConnection only for
// signaling: it sends the SDP as a base64 blob, the same wrapping as peer.js.
// Then it opens a WebRTC data channel and streams the game state to the TV.
//
// The TV is a SPECTATOR. It never sends input. The stream carries the world
// state plus the FPS and the performance data, so the perf graph shows on the TV.
//
// Signaling flow (base64 SDP over the presentation channel):
//   1. Controller creates an offer, waits for ICE, sends base64 offer.
//   2. Receiver sets the offer, creates an answer, waits for ICE, sends base64
//      answer back over the same presentation channel.
//   3. Controller sets the answer. The data channel opens. The stream starts.

import { CONFIG } from '../config.js';

const b64encode = (str) => btoa(unescape(encodeURIComponent(str)));
const b64decode = (b64) => decodeURIComponent(escape(atob(b64)));

export class SpectatorCast {
  constructor(game) {
    this.game = game;
    this.request = null;
    this.connection = null;    // PresentationConnection (signaling channel)
    this.pc = null;
    this.channel = null;
    this.active = false;
    this._acc = 0;
    this.onStatus = null;      // (msg) => void
    this._initSent = false;
  }

  available() {
    return typeof window !== 'undefined' && 'PresentationRequest' in window;
  }

  _status(msg) { if (this.onStatus) this.onStatus(msg); }

  // Open the device picker and start the receiver page on the chosen screen.
  async start() {
    if (!this.available()) { this._status('Presentation API not supported.'); return; }
    try {
      this.request = new PresentationRequest([CONFIG.cast.receiverPath]);
      this._status('Choose a screen to cast to...');
      this.connection = await this.request.start();
      this._status('Screen connected. Waiting for the TV to load...');
      this._offered = false;
      this._bindConnection(this.connection);
      // The TV sends 'ready' once it listens. The host then sends the offer.
      // A fallback timer covers a TV that does not send 'ready'.
      this._readyTimer = setTimeout(() => {
        if (!this._offered) { this._status('No ready signal. Sending offer anyway...'); this._makeOffer(); }
      }, 2500);
    } catch (e) {
      this._status('Cast failed: ' + e.message);
    }
  }

  _bindConnection(conn) {
    conn.addEventListener('message', (e) => this._onSignal(e.data));
    conn.addEventListener('close', () => this.stop('closed'));
    conn.addEventListener('terminate', () => this.stop('terminated'));
  }

  _mkPeer() {
    const servers = CONFIG.cast.stunServers.length ? [{ urls: CONFIG.cast.stunServers }] : [];
    this.pc = new RTCPeerConnection({ iceServers: servers });
    this.channel = this.pc.createDataChannel('spectate', { ordered: false, maxRetransmits: 0 });
    this.channel.onopen = () => this._onChannelOpen();
    this.channel.onclose = () => this._status('Spectator channel closed.');
  }

  // Wait until ICE gathering completes, so the SDP is complete (no trickle).
  _waitIce() {
    return new Promise((resolve) => {
      if (this.pc.iceGatheringState === 'complete') return resolve();
      const check = () => {
        if (this.pc.iceGatheringState === 'complete') {
          this.pc.removeEventListener('icegatheringstatechange', check);
          resolve();
        }
      };
      this.pc.addEventListener('icegatheringstatechange', check);
      setTimeout(resolve, 4000);
    });
  }

  async _makeOffer() {
    if (this._offered) return;      // send the offer once
    this._offered = true;
    clearTimeout(this._readyTimer);
    this._mkPeer();
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await this._waitIce();
    // Send the complete offer as a base64 blob over the presentation channel.
    this.connection.send(b64encode(JSON.stringify({ type: 'offer', sdp: this.pc.localDescription.sdp })));
    this._status('Offer sent. Waiting for the TV answer...');
  }

  async _onSignal(data) {
    let msg;
    try { msg = JSON.parse(b64decode(data)); } catch { return; }
    if (msg.type === 'ready') {
      // The TV is listening. Send the offer now (race-free).
      this._status('TV ready. Sending offer...');
      this._makeOffer();
    } else if (msg.type === 'answer') {
      await this.pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
      this._status('Answer set. Connecting the spectator stream...');
    }
  }

  _onChannelOpen() {
    this.active = true;
    this._initSent = false;
    this._status('Casting! The TV now spectates the host.');
    this._sendInit();
  }

  // Send the dungeon seed once so the receiver builds the same walls.
  _sendInit() {
    const g = this.game;
    this._send({
      t: 'init',
      seed: CONFIG.world.seed,
      dungeonIndex: g.dungeonIndex,
      endless: g.endless,
      render: CONFIG.cast.receiverRender,
    });
    this._initSent = true;
  }

  _send(obj) {
    if (this.channel && this.channel.readyState === 'open') {
      try { this.channel.send(JSON.stringify(obj)); } catch (e) {}
    }
  }

  // Called each frame by the game. Streams a snapshot at the cast tick rate.
  tick(dt) {
    if (!this.active) return;
    if (!this._initSent) this._sendInit();
    this._acc += dt * 1000;
    const interval = 1000 / CONFIG.cast.tickRate;
    if (this._acc < interval) return;
    this._acc = 0;
    this._send(this._snapshot());
  }

  _snapshot() {
    const g = this.game;
    const cam = g.camera;

    const players = g.players
      .filter(p => p && !p.dead)
      .map(p => [Math.round(p.x), Math.round(p.y), Math.round(p.hp), p.maxHp, +p.aim.toFixed(2)]);

    const enemies = [];
    for (const e of g.enemies) {
      if (e.dead || e.isBoss) continue;
      enemies.push([Math.round(e.x), Math.round(e.y), e.kind]);
    }

    let boss = null;
    if (g.activeBoss && !g.activeBoss.dead) {
      const b = g.activeBoss;
      boss = [Math.round(b.x), Math.round(b.y), +b.hpFrac.toFixed(3), b.name || 'BOSS', b.radius];
    }

    // Bullets as a flat array: x, y, faction(0 player / 1 enemy).
    const bullets = [];
    if (CONFIG.cast.streamBullets) {
      const list = g.bullets.list;
      const max = Math.min(list.length, CONFIG.cast.maxBullets);
      for (let i = 0; i < max; i++) {
        const b = list[i];
        bullets.push(Math.round(b.x), Math.round(b.y), b.faction === 'enemy' ? 1 : 0);
      }
    }

    return {
      t: 'snap',
      render: CONFIG.cast.receiverRender, // let the TV switch render path live
      cam: [Math.round(cam.x), Math.round(cam.y), cam.viewW, cam.viewH],
      score: g.score,
      label: g.dungeonLabel(),
      players, enemies, boss, bullets,
      perf: this._perfBlock(),
    };
  }

  // Package the profiler data so the TV shows the FPS counter and the graph.
  _perfBlock() {
    const prof = this.game.profiler;
    const ft = prof.frameTimes;
    // Trim and round the frame-time samples to keep the stream small.
    const trimmed = ft.slice(-120).map(v => Math.round(v * 10) / 10);
    const roundObj = (o) => { const r = {}; for (const k in o) r[k] = Math.round((o[k] + Number.EPSILON) * 100) / 100; return r; };
    return {
      fps: Math.round(prof.fps),
      maxSamples: prof.maxSamples,
      stats: prof.stats(),
      frameTimes: trimmed,
      systems: roundObj(prof.systems),
      counters: { ...prof.counters, ...this.game._extraCounters() },
    };
  }

  stop(why = 'stopped') {
    this.active = false;
    try { if (this.channel) this.channel.close(); } catch (e) {}
    try { if (this.pc) this.pc.close(); } catch (e) {}
    try { if (this.connection) this.connection.terminate(); } catch (e) {}
    this.pc = null; this.channel = null; this.connection = null;
    this._status('Cast ' + why + '.');
  }
}
