import { THREE } from '../engine/three.js';
import { FIELD } from '../../shared/field.js';
import { createGameState } from './gameState.js';
import { createEvents } from './events.js';
import { createPreferences } from './preferences.js';
import { createScene } from '../engine/scene.js';
import { createRenderer } from '../engine/renderer.js';
import { createCamera } from '../engine/camera.js';
import { initializeLighting } from '../engine/lighting.js';
import { createField } from '../world/field.js';
import { createGoals } from '../world/goals.js';
import { createStadium } from '../world/stadium.js';
import { createPlayerFactory } from '../gameplay/player.js';
import { createPlayers } from '../gameplay/players.js';
import { createBall } from '../gameplay/ball.js';
import { createControls } from '../gameplay/controls.js';
import { createUI } from '../ui/hud.js';
import { createSettings } from '../ui/settings.js';
import { createLobby } from '../lobby/lobby.js';
import { initializeInvitations } from '../lobby/invitation.js';
import { createSession } from '../network/session.js';
import { createMessageHandler } from '../network/messages.js';
import { createAudioManager } from '../audio/audioManager.js';

const state = createGameState();
const preferences = createPreferences();
const events = createEvents();
const scene = createScene();
const renderer = createRenderer();
const camera = createCamera({ renderer });
initializeLighting(scene);
createStadium({ scene, field: FIELD });
const field = createField({ scene, renderer });
createGoals({ scene });
const footballers = createPlayerFactory({ scene });
const players = createPlayers({ scene, state, ...footballers });
const ball = createBall({ scene });
const audio = createAudioManager({ events, preferences });

// Callbacks run only after initialization; no domain imports the composition root.
const ui = createUI({ state, canvas: renderer.domElement,
  preferences,
  onClearInput: () => controls.clearGameInput(),
  onLeaveMatch: () => network.leaveMatch(),
});
initializeInvitations({ state, ui });
const settings = createSettings({ preferences, onInteraction: () => audio.unlock().catch(() => {}) });
const network = createSession({ state, ui, players,
  onMessage: (message) => messages.handleMessage(message),
});
const controls = createControls({ state, ui, network, preferences, settings });
const lobby = createLobby({ state, ui, network, ...field, ...footballers });
const messages = createMessageHandler({ state, ui, lobby, players, ball, controls,
  canvas: renderer.domElement, events, audio,
});
lobby.start();
window.addEventListener('pointerdown', () => audio.unlock().catch(() => {}));
window.addEventListener('keydown', () => audio.unlock().catch(() => {}));

const clock = new THREE.Clock();
function render() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();
  if (state.phase === 'playing' && !state.waitingInLobby) {
    controls.sendInput(now);
    ui.updateClock();
    ball.update(dt, now);
    players.update(dt);
  }
  const showingLobby = !ui.dom.lobbyOverlay.hidden;
  audio.setLobbyActive(showingLobby);
  if (showingLobby) lobby.render(now);
  else {
    camera.updateBroadcastCamera(ball.mesh);
    renderer.render(scene, camera.camera);
  }
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
window.addEventListener('pagehide', () => { audio.dispose(); network.dispose(); });
