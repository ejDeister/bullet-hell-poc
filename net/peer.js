// net/peer.js
// Thin RTCPeerConnection + data channel wrapper for manual (serverless)
// signaling. The host creates an offer and waits for ICE gathering to complete
// so all candidates are baked into the SDP; the guest answers the same way.
// SDP blobs are JSON-wrapped and base64-encoded for copy/paste.

import { CONFIG } from '../config.js';

const b64encode = (str) => btoa(unescape(encodeURIComponent(str)));
const b64decode = (b64) => decodeURIComponent(escape(atob(b64)));

export class Peer {
  constructor() {
    this.pc = null;
    this.channel = null;
    this.isHost = false;
    this.onMessage = null;
    this.onState = null;    // (status:string) => void
    this.onOpen = null;
    this.onClose = null;
    this._pingSent = 0;
    this.rtt = 0;
  }

  _mkConnection() {
    const servers = CONFIG.net.stunServers.length
      ? [{ urls: CONFIG.net.stunServers }] : [];
    this.pc = new RTCPeerConnection({ iceServers: servers });
    this.pc.oniceconnectionstatechange = () => {
      const st = this.pc.iceConnectionState;
      this._state('ice: ' + st);
      if (st === 'failed' || st === 'disconnected') this.onClose && this.onClose(st);
    };
  }

  _bindChannel(ch) {
    this.channel = ch;
    ch.onopen = () => { this._state('connected'); this.onOpen && this.onOpen(); this._startPing(); };
    ch.onclose = () => { this._state('closed'); this.onClose && this.onClose('closed'); };
    ch.onmessage = (e) => {
      // Handle ping/pong internally; forward the rest.
      if (typeof e.data === 'string' && e.data[0] === '\x01') { this._onPing(e.data); return; }
      this.onMessage && this.onMessage(e.data);
    };
  }

  _state(s) { this.onState && this.onState(s); }

  // Wait until ICE gathering completes (or a timeout) so the SDP is complete.
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
      setTimeout(resolve, 4000); // safety timeout for restrictive networks
    });
  }

  // Host: create offer, return base64 blob to share.
  async createOffer() {
    this.isHost = true;
    this._mkConnection();
    const ch = this.pc.createDataChannel('game', { ordered: false, maxRetransmits: 0 });
    this._bindChannel(ch);
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await this._waitIce();
    return b64encode(JSON.stringify({ type: 'offer', sdp: this.pc.localDescription.sdp }));
  }

  // Host: accept the guest's answer blob.
  async acceptAnswer(b64) {
    const { sdp } = JSON.parse(b64decode(b64));
    await this.pc.setRemoteDescription({ type: 'answer', sdp });
    this._state('answer accepted');
  }

  // Guest: accept offer blob, return base64 answer blob.
  async createAnswer(b64) {
    this.isHost = false;
    this._mkConnection();
    this.pc.ondatachannel = (e) => this._bindChannel(e.channel);
    const { sdp } = JSON.parse(b64decode(b64));
    await this.pc.setRemoteDescription({ type: 'offer', sdp });
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await this._waitIce();
    return b64encode(JSON.stringify({ type: 'answer', sdp: this.pc.localDescription.sdp }));
  }

  send(data) {
    if (this.channel && this.channel.readyState === 'open') {
      try { this.channel.send(data); } catch (e) {}
    }
  }

  _startPing() {
    this._pingTimer = setInterval(() => {
      this._pingSent = performance.now();
      this.send('\x01p');
    }, 1000);
  }
  _onPing(data) {
    if (data === '\x01p') { this.send('\x01o'); }          // reply pong
    else if (data === '\x01o') { this.rtt = performance.now() - this._pingSent; }
  }

  close() {
    clearInterval(this._pingTimer);
    if (this.channel) this.channel.close();
    if (this.pc) this.pc.close();
  }
}
