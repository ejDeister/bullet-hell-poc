// net/receiver.js
// The Presentation API receiver (for a second screen or an HDMI display). It
// decodes the base64 offer over the presentation connection, answers the same
// way, opens a WebRTC data channel, and feeds the shared SpectatorView.
//
// NOTE: a standard Chromecast does NOT run this page in its own browser. Chrome
// mirrors an offscreen tab to the TV as video. For a Chromecast that runs this
// code locally, use the Cast Custom Receiver (cast-receiver.html) instead.

import { CONFIG } from '../config.js';
import { SpectatorView } from './spectator-view.js';

const b64encode = (str) => btoa(unescape(encodeURIComponent(str)));
const b64decode = (b64) => decodeURIComponent(escape(atob(b64)));

const statusEl = document.getElementById('status');
const canvas = document.getElementById('spectator');
const view = new SpectatorView({
  canvas,
  stage: document.getElementById('stage'),
  bannerEl: document.getElementById('banner'),
  scoreEl: document.getElementById('score'),
});
view.start();

function setStatus(msg) { statusEl.textContent = msg; statusEl.style.display = msg ? '' : 'none'; }

let pc = null;

if (navigator.presentation && navigator.presentation.receiver) {
  navigator.presentation.receiver.connectionList.then((list) => {
    list.connections.forEach(bindConnection);
    list.addEventListener('connectionavailable', (e) => bindConnection(e.connection));
  }).catch((e) => setStatus('Receiver error: ' + e.message));
} else {
  setStatus('Open this page through a cast from the host, not directly.');
}

function bindConnection(conn) {
  setStatus('Host connected. Negotiating WebRTC...');
  conn.addEventListener('message', (e) => onSignal(conn, e.data));
  conn.addEventListener('close', () => setStatus('Host closed the connection.'));
  conn.addEventListener('terminate', () => setStatus('Cast ended.'));
  sendReady(conn);
}

function sendReady(conn) {
  const ping = () => { try { conn.send(b64encode(JSON.stringify({ type: 'ready' }))); } catch (e) {} };
  if (conn.state === 'connected' || conn.state === undefined) ping();
  conn.addEventListener('connect', ping);
  let n = 0;
  const t = setInterval(() => { ping(); if (++n >= 5) clearInterval(t); }, 400);
}

async function onSignal(conn, data) {
  let msg;
  try { msg = JSON.parse(b64decode(data)); } catch { return; }
  if (msg.type !== 'offer') return;
  const servers = CONFIG.cast.stunServers.length ? [{ urls: CONFIG.cast.stunServers }] : [];
  pc = new RTCPeerConnection({ iceServers: servers });
  pc.ondatachannel = (e) => bindChannel(e.channel);
  await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitIce(pc);
  conn.send(b64encode(JSON.stringify({ type: 'answer', sdp: pc.localDescription.sdp })));
  setStatus('Answer sent. Starting the spectator view...');
}

function waitIce(pc) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const check = () => {
      if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', check); resolve(); }
    };
    pc.addEventListener('icegatheringstatechange', check);
    setTimeout(resolve, 4000);
  });
}

function bindChannel(ch) {
  ch.onmessage = (e) => view.handleMessage(e.data);
  ch.onopen = () => setStatus('');
}
