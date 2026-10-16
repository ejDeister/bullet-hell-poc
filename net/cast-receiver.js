// net/cast-receiver.js
// The Cast Custom Receiver. This runs in the Chromecast's OWN browser (loaded
// by the Cast Application Framework). It listens on the custom message channel,
// feeds the shared SpectatorView, and draws the game locally. No video.
//
// The receiver shows the FPS counter and the performance graph, measured on the
// device, so the numbers reflect the Chromecast itself.

import { CONFIG } from '../config.js';
import { SpectatorView } from './spectator-view.js';

const statusEl = document.getElementById('status');
const view = new SpectatorView({
  canvas: document.getElementById('spectator'),
  stage: document.getElementById('stage'),
  bannerEl: document.getElementById('banner'),
  scoreEl: document.getElementById('score'),
});
view.start();

const NS = CONFIG.cast.namespace;

// The CAF receiver SDK is loaded by the page <script> tag.
const context = cast.framework.CastReceiverContext.getInstance();

// Custom messages carry the game state and the perf data.
context.addCustomMessageListener(NS, (event) => {
  statusEl.style.display = 'none';
  view.handleMessage(event.data); // object (JSON namespace) or string
});

// Keep the receiver alive without media, since this is a data-only app.
const options = new cast.framework.CastReceiverOptions();
options.disableIdleTimeout = true;
options.customNamespaces = { [NS]: cast.framework.system.MessageType.JSON };

context.start(options);
