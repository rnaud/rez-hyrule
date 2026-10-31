import { Game } from './game/Game.js';

const canvas = document.getElementById('stage-canvas');
const loading = document.getElementById('loading');

let game = null;
let last = performance.now();
let frames = 0;

function fail(message) {
  if (!loading) return;
  loading.classList.remove('done');
  loading.innerHTML = `
    <div class="loading-sigil">△</div>
    <div class="loading-text" style="max-width:520px;text-align:center;line-height:2;letter-spacing:.2em">${message}</div>`;
}

try {
  game = new Game(canvas);
  game.start();
  window.__rez = game;
} catch (error) {
  console.error('[REZ: HYRULE] failed to initialize', error);
  fail('THE SACRED RAILS COULD NOT BE OPENED.<br>THIS LEGEND REQUIRES WEBGL 2.');
}

function frame(now) {
  const raw = (now - last) / 1000;
  last = now;
  const dt = Math.min(Math.max(raw, 0), 0.05);
  if (game) {
    try {
      game.update(dt);
      game.world.render();
    } catch (error) {
      console.error('[REZ: HYRULE] render error', error);
      game = null;
      fail('THE RAIL HAS BROKEN.<br>CHECK THE CONSOLE FOR DETAILS.');
    }
  }
  frames++;
  if (frames === 2 && loading) {
    loading.classList.add('done');
    window.setTimeout(() => loading.remove(), 900);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Keep the interface crisp once the display fonts settle.
if (document.fonts?.ready) {
  document.fonts.ready.then(() => document.body.classList.add('fonts-ready'));
}
