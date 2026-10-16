// net/signaling-ui.js
// <bh-signaling>: the copy/paste base64 SDP handshake UI for manual signaling.
// Host flow: Host -> copy offer -> paste guest answer -> Connect.
// Guest flow: paste host offer -> Join -> copy answer back to host.

import { Peer } from './peer.js';

export class SignalingUI extends HTMLElement {
  static css = `
    bh-signaling {
      position: fixed; inset: 0; z-index: 70; display: none;
      background: rgba(6,8,16,0.92); color: #cfe; font: 13px/1.5 ui-monospace, Menlo, monospace;
      align-items: center; justify-content: center;
    }
    bh-signaling.open { display: flex; }
    bh-signaling .panel { width: 560px; max-width: 92vw; background: #11162a; border: 1px solid #2a3350;
      border-radius: 8px; padding: 18px; }
    bh-signaling h2 { margin: 0 0 4px; color: #6cf; }
    bh-signaling .exp { color: #fd6; margin-bottom: 10px; }
    bh-signaling textarea { width: 100%; height: 80px; background: #0b0f1e; color: #9ef; border: 1px solid #2a3350;
      border-radius: 4px; padding: 6px; resize: vertical; }
    bh-signaling .grid { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0; }
    bh-signaling button { background: #1a2340; color: #cfe; border: 1px solid #2a3350; border-radius: 4px;
      padding: 7px 12px; cursor: pointer; }
    bh-signaling button:hover { background: #25305a; }
    bh-signaling .status { margin-top: 8px; color: #9ab; }
    bh-signaling .err { color: #f66; }
    bh-signaling label { color: #9ab; display: block; margin-top: 8px; }
  `;

  connectedCallback() {
    if (!document.getElementById('bh-sig-style')) {
      const s = document.createElement('style'); s.id = 'bh-sig-style';
      s.textContent = SignalingUI.css; document.head.appendChild(s);
    }
    this.innerHTML = `
      <div class="panel">
        <h2>Multiplayer (WebRTC, manual signaling)</h2>
        <div class="exp">EXPERIMENTAL. No server. Copy/paste the codes between the two players.</div>
        <div class="grid">
          <button id="host">Host (create offer)</button>
          <button id="join">Join (paste offer first)</button>
          <button id="close">Close</button>
        </div>
        <label>Your code (send this to the other player):</label>
        <textarea id="mine" readonly placeholder="Click Host, or paste+Join to generate"></textarea>
        <div class="grid"><button id="copy">Copy my code</button></div>
        <label>Their code (paste what they sent you):</label>
        <textarea id="theirs" placeholder="Paste the other player's code here"></textarea>
        <div class="grid"><button id="accept">Accept their code / Connect</button></div>
        <div class="status" id="status">Idle.</div>
      </div>`;
    this._wire();
  }

  setGame(game) { this.game = game; }
  open() { this.classList.add('open'); if (this.game) this.game.paused = true; }
  hide() { this.classList.remove('open'); if (this.game) this.game.paused = false; }

  _status(msg, err = false) {
    const el = this.querySelector('#status');
    el.textContent = msg; el.className = 'status' + (err ? ' err' : '');
  }

  _wire() {
    const mine = this.querySelector('#mine');
    const theirs = this.querySelector('#theirs');

    this.querySelector('#close').onclick = () => this.hide();
    this.querySelector('#copy').onclick = () => {
      mine.select(); navigator.clipboard && navigator.clipboard.writeText(mine.value);
      this._status('Copied. Send it to the other player.');
    };

    this.querySelector('#host').onclick = async () => {
      this.peer = new Peer();
      this._bindPeer();
      this._status('Creating offer, gathering ICE candidates...');
      try {
        mine.value = await this.peer.createOffer();
        this._status('Offer ready. Copy it, send it, then paste their answer and Connect.');
      } catch (e) { this._status('Offer failed: ' + e.message, true); }
    };

    this.querySelector('#join').onclick = async () => {
      if (!theirs.value.trim()) { this._status('Paste the host code first.', true); return; }
      this.peer = new Peer();
      this._bindPeer();
      this._status('Creating answer, gathering ICE candidates...');
      try {
        mine.value = await this.peer.createAnswer(theirs.value.trim());
        this._status('Answer ready. Copy it and send it back to the host.');
      } catch (e) { this._status('Join failed (bad code?): ' + e.message, true); }
    };

    this.querySelector('#accept').onclick = async () => {
      if (!this.peer) { this._status('Host or Join first.', true); return; }
      if (!this.peer.isHost) { this._status('Guest connects automatically once the host accepts your answer.'); return; }
      try {
        await this.peer.acceptAnswer(theirs.value.trim());
        this._status('Answer accepted. Waiting for data channel...');
      } catch (e) { this._status('Connect failed (bad answer?): ' + e.message, true); }
    };
  }

  _bindPeer() {
    const p = this.peer;
    p.onState = (s) => this._status('Status: ' + s);
    p.onOpen = () => {
      this._status('Connected! Starting session.');
      this.game.startNetGame(p);
      setTimeout(() => this.hide(), 600);
    };
    p.onClose = (why) => {
      this._status('Disconnected (' + why + '). Falling back to single-player.', true);
      this.game.endNetGame();
    };
  }
}
customElements.define('bh-signaling', SignalingUI);
