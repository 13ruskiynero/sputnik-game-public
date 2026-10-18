import { Game } from './game.js';
import { createWorld } from './world.js';
import { UI } from './ui.js';

const canvas = document.getElementById('scene');
const game = new Game();
const world = createWorld(canvas, where => game.select(where));
const time = { scale: 1, paused: false };
const ui = new UI(game, world, time);

world.syncSatellites(game.state.satellites);
world.setContract(game.state.story?.contractsUnlocked ? game.state.contract : null);
ui.render(game.state);

let lastContractId = game.state.contract ? game.state.contract.id : null;

game.subscribe(state => {
  if (state.contract && state.contract.id !== lastContractId) {
    lastContractId = state.contract.id;
    world.setContract(state.story?.contractsUnlocked ? state.contract : null);
  }
  world.syncSatellites(state.satellites);
  ui.render(state);
});

let last = performance.now();
function frame(now) {
  const scale = time.paused ? 0 : time.scale;
  const dt = Math.min((now - last) / 1000, 0.05) * scale;
  last = now;
  const sunlit = world.getSunlitMap();
  game.update(dt, sunlit);
  world.update(dt, game.state);
  world.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.addEventListener('resize', () => world.resize());
setInterval(() => game.save(), 3000);
setInterval(() => ui.render(game.state), 1000);

// Для отладки и автотестов.
window.__sputnik = { game, world, ui, time };
