// core/audio.js
// Procedural sound effects with the Web Audio API. No asset files: every sound
// is synthesized from oscillators and noise. A browser blocks audio until a
// user gesture, so call resume() on the first input.
//
// Throttling: many bullets fire per frame, so each named sound has a minimum
// interval and a voice cap. This keeps the mix clean and cheap.

import { CONFIG } from '../config.js';

export class SFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this._lastPlay = {};      // name -> last play time (ms)
    this._voices = 0;         // active oscillator count
    this._noiseBuf = null;
  }

  // Create the context on the first user gesture (click or key).
  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = CONFIG.audio.master;
      this.master.connect(this.ctx.destination);
      this._noiseBuf = this._makeNoise();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  _makeNoise() {
    const len = this.ctx.sampleRate * 0.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  // Gate: respect the enable flag, throttle, and the voice cap.
  _gate(name, minInterval) {
    if (!CONFIG.audio.enabled || !this.ctx) return false;
    const now = performance.now();
    if (this._lastPlay[name] && now - this._lastPlay[name] < minInterval) return false;
    if (this._voices > CONFIG.audio.maxVoices) return false;
    this._lastPlay[name] = now;
    return true;
  }

  // A tone with a short gain envelope. type: oscillator shape.
  _tone(freq, dur, type = 'square', gain = 0.3, slideTo = null) {
    const ctx = this.ctx, t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain * CONFIG.audio.sfx, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.02);
    this._voices++;
    osc.onended = () => { this._voices--; };
  }

  // A filtered noise burst (hits, explosions).
  _noise(dur, cutoff, gain = 0.4, cutoffEnd = null) {
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(cutoff, t);
    if (cutoffEnd) filt.frequency.exponentialRampToValueAtTime(Math.max(50, cutoffEnd), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain * CONFIG.audio.sfx, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
    this._voices++;
    src.onended = () => { this._voices--; };
  }

  // ---- named sounds ----------------------------------------------------
  shoot(weaponId) {
    if (!this._gate('shoot', 35)) return;
    const map = { pistol: 520, smg: 680, shotgun: 300, sniper: 900 };
    const f = map[weaponId] || 520;
    this._tone(f, 0.08, 'square', 0.18, f * 0.5);
  }
  enemyShoot() {
    if (!this._gate('enemyShoot', 70)) return;
    this._tone(220, 0.09, 'sawtooth', 0.10, 150);
  }
  hit() {
    if (!this._gate('hit', 25)) return;
    this._noise(0.06, 3200, 0.22, 800);
  }
  explosion() {
    if (!this._gate('explosion', 60)) return;
    this._noise(0.45, 1400, 0.5, 120);
    this._tone(90, 0.4, 'triangle', 0.3, 40);
  }
  dash() {
    if (!this._gate('dash', 120)) return;
    this._tone(300, 0.18, 'sine', 0.22, 900);
  }
  pickup() {
    if (!this._gate('pickup', 60)) return;
    this._tone(660, 0.1, 'square', 0.25);
    setTimeout(() => this._gate('pickup2', 0) && this._tone(990, 0.12, 'square', 0.25), 90);
  }
  hurt() {
    if (!this._gate('hurt', 120)) return;
    this._tone(360, 0.2, 'sawtooth', 0.3, 110);
  }
  enemyDeath() {
    if (!this._gate('enemyDeath', 40)) return;
    this._tone(180, 0.18, 'square', 0.2, 60);
  }
  bossAppear() {
    if (!this._gate('bossAppear', 500)) return;
    this._tone(70, 0.9, 'sawtooth', 0.35, 55);
    this._tone(110, 0.9, 'triangle', 0.25);
  }
  gameOver() {
    if (!this._gate('gameOver', 500)) return;
    this._tone(300, 0.8, 'sawtooth', 0.4, 70);
  }
  uiToggle() {
    if (!this._gate('ui', 40)) return;
    this._tone(440, 0.05, 'square', 0.15);
  }
}
