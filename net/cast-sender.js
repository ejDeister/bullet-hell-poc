// net/cast-sender.js
// The Google Cast sender (host side). It launches your registered Cast Custom
// Receiver on the Chromecast with the Cast Application Framework (CAF), then
// streams the game state over a custom message channel. The receiver runs YOUR
// page in the Chromecast's own browser and draws locally. No video. No artifacts.
//
// Set config.cast.appId to your Cast Application ID after you register the
// receiver in the Google Cast Developer Console.

import { CONFIG } from '../config.js';
import { buildInit, buildSnapshot } from './spectator-stream.js';

export class CastSender {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.session = null;
    this._acc = 0;
    this._initSent = false;
    this.onStatus = null;
  }

  // The feature needs a registered Application ID.
  available() { return !!CONFIG.cast.appId; }
  _status(m) { if (this.onStatus) this.onStatus(m); }

  // Load the Cast sender SDK once, from the Google CDN.
  _loadSdk() {
    return new Promise((resolve, reject) => {
      if (window.cast && window.cast.framework) return resolve();
      window.__onGCastApiAvailable = (isAvailable) => {
        if (isAvailable) resolve();
        else reject(new Error('Cast sender API not available'));
      };
      const s = document.createElement('script');
      s.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
      s.onerror = () => reject(new Error('Failed to load the Cast SDK'));
      document.head.appendChild(s);
    });
  }

  async start() {
    if (!CONFIG.cast.appId) { this._status('Set cast.appId first (register a Cast receiver).'); return; }
    try {
      this._status('Loading Cast SDK...');
      await this._loadSdk();
      const ctx = cast.framework.CastContext.getInstance();
      ctx.setOptions({
        receiverApplicationId: CONFIG.cast.appId,
        autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
      });
      ctx.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, (e) => this._onSessionState(e));
      this._status('Choose your Chromecast...');
      await ctx.requestSession(); // shows the cast dialog
    } catch (e) {
      this._status('Cast failed: ' + (e && (e.message || e.code) || e));
    }
  }

  _onSessionState(e) {
    const S = cast.framework.SessionState;
    if (e.sessionState === S.SESSION_STARTED || e.sessionState === S.SESSION_RESUMED) {
      this.session = cast.framework.CastContext.getInstance().getCurrentSession();
      this.active = true;
      this._initSent = false;
      this._status('Casting! The TV runs the spectator app.');
    } else if (e.sessionState === S.SESSION_ENDED) {
      this.active = false;
      this.session = null;
      this._status('Cast ended.');
    }
  }

  _send(obj) {
    if (!this.session) return;
    try { this.session.sendMessage(CONFIG.cast.namespace, obj); } catch (e) {}
  }

  // Called each frame by the game. Streams at the cast tick rate.
  tick(dt) {
    if (!this.active || !this.session) return;
    if (!this._initSent) { this._send(buildInit(this.game)); this._initSent = true; }
    this._acc += dt * 1000;
    const interval = 1000 / CONFIG.cast.tickRate;
    if (this._acc < interval) return;
    this._acc = 0;
    this._send(buildSnapshot(this.game, {}));
  }

  stop() {
    try { if (this.session) this.session.endSession(true); } catch (e) {}
    this.active = false;
    this.session = null;
  }
}
