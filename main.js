// main.js — entry point. Builds the UI elements, wires input toggles, and
// starts the game loop. Also handles ENTER for restart / endless unlock.

import { CONFIG } from './config.js';
import { Game } from './core/game.js';
import { PerfOverlay } from './ui/perf-overlay.js';
import { Hud } from './ui/hud.js';
import { Minimap } from './ui/minimap.js';
import { DevMenu } from './ui/dev-menu.js';
import { SignalingUI } from './net/signaling-ui.js';

const game = new Game(document.body);

// UI elements.
const perf = new PerfOverlay();
const hud = new Hud();
const minimap = new Minimap();
const devMenu = new DevMenu();
const signaling = new SignalingUI();
document.body.append(perf, hud, minimap, devMenu, signaling);

devMenu.setGame(game);
signaling.setGame(game);
game.attachUI({ perf, hud, minimap, devMenu, signaling });

// ~ toggles the dev menu.
game.input.onDevMenu(() => { game.audio.uiToggle(); devMenu.toggle(); });

// A browser blocks audio until a user gesture. Resume on the first input.
const resumeAudio = () => game.audio.resume();
window.addEventListener('pointerdown', resumeAudio);
window.addEventListener('keydown', resumeAudio);

// Keyboard: P toggles perf overlay; ENTER restarts or unlocks endless.
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'p') perf.classList.toggle('visible');
  if (e.key === 'Enter') {
    if (game._awaitRestart) { game._awaitRestart = false; game.restart(); }
    else if (game._awaitEndless) {
      game._awaitEndless = false;
      game.endless = true; game.endlessFloor = 0;
      game.loadDungeon(1000);
      game.toast('ENDLESS MODE — difficulty scales each floor.');
    }
  }
});

// Show the perf overlay by default when debug benchmarks are on.
if (CONFIG.debug.logBenchmarks) perf.classList.add('visible');

game.start();

// Expose for console poking / debugging.
window.GAME = game;
