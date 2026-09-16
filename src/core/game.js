import { isMatchPhase } from '../../shared/matchPhases.js';
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
import { createShotPowerBar } from '../ui/shotPowerBar.js';
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
  onDisconnect: () => messages.clearGoalSequence(true),
});
const shotBar = createShotPowerBar(document.getElementById('shotPower'));
const controls = createControls({ state, ui, network, preferences, settings, players, shotBar, events });
const lobby = createLobby({ state, ui, network, events, audio, ...field, ...footballers });
const messages = createMessageHandler({ state, ui, lobby, players, ball, controls,
  canvas: renderer.domElement, events, audio, camera,
});
lobby.start();
window.addEventListener('pointerdown', () => audio.unlock().catch(() => {}));
window.addEventListener('keydown', () => audio.unlock().catch(() => {}));

const clock = new THREE.Clock();
const barAnchor = new THREE.Vector3();
// Keeps the shot bar above the controlled player's name tag; hides it whenever
// charging is no longer possible (phase change, player removed).
function updateShotBar(now) {
  if (!shotBar.isCharging()) return;
  const local = players.getLocalPosition();
  if (state.phase !== 'playing' || state.waitingInLobby || !local) { controls.cancelShotCharge(); return; }
  // At the 2 s maximum the server fires on its own; the bar just goes away.
  if (shotBar.level(now) >= 1) { shotBar.stop(); return; }
  barAnchor.set(local.x, players.getLocalTagHeight() + .5, local.z).project(camera.camera);
  shotBar.update(now, {
    x: (barAnchor.x + 1) / 2 * window.innerWidth,
    y: (1 - barAnchor.y) / 2 * window.innerHeight,
    visible: barAnchor.z < 1,
  });
}
function render() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();
  if (isMatchPhase(state.phase) && !state.waitingInLobby) {
    controls.sendInput(now);
    ui.updateClock();
    ball.update(dt, now);
    players.update(dt, { localCharging: shotBar.isCharging() });
  }
  const showingLobby = !ui.dom.lobbyOverlay.hidden;
  audio.setLobbyActive(showingLobby);
  // Crowd ambience only while the match pitch itself is showing.
  audio.setMatchActive(!showingLobby && state.joined && isMatchPhase(state.phase) && !state.waitingInLobby);
  if (showingLobby) lobby.render(now);
  else {
    camera.updateBroadcastCamera(ball.mesh, players.getLocalPosition(), dt);
    renderer.render(scene, camera.camera);
  }
  updateShotBar(now);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
window.addEventListener('pagehide', () => { audio.dispose(); network.dispose(); ui.goalPresentation.dispose(); });
