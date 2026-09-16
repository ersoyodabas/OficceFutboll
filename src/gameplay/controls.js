import { isMatchPhase } from '../../shared/matchPhases.js';
import { CLIENT, SERVER } from '../network/protocol.js';
import { SHOT_MAX_CHARGE_MS } from '../../shared/shot.js';

export function createControls({ state, ui, network, preferences, settings, players, shotBar, events }) {
  const pressed = Object.create(null);
  const isBound = (name, code) => preferences.get().keys[name] === code;
  const anyGameKey = (code) => Object.values(preferences.get().keys).includes(code);

  // S always asks the server to start a charge; the server decides whether it is
  // a charged shot (with the ball) or a standing tackle (without it). The server
  // starts timing the moment it receives this press, so the bar is anchored to
  // the press itself on this browser's monotonic clock (performance.now) and
  // shows shotChargeLevel(elapsed), the same 0..1 function the server uses. It
  // never reads an estimated server clock, so latency changes, clock skew or
  // clock smoothing cannot stretch the 2 s fill.
  let shootHeld = false;
  let shotPressedAt = null;          // performance.now() of the press that started the charge
  let serverChargeStartedAt = null;  // server time from 'shot_charge', compared only with server times
  function cancelShotCharge() {
    const wasActive = shootHeld || shotBar.isCharging();
    shootHeld = false;
    shotPressedAt = serverChargeStartedAt = null;
    shotBar.stop();
    if (wasActive && network.isOpen()) network.send({ type: CLIENT.SHOT_CANCEL });
  }
  events.on(SERVER.ACTION_RESULT, (msg) => {
    if (msg.id !== state.myId) return;
    if (msg.action === 'shot_charge' && shootHeld && shotPressedAt !== null) {
      serverChargeStartedAt = typeof msg.startedAt === 'number' ? msg.startedAt : null;
      shotBar.start(shotPressedAt);
    }
    // The automatic maximum shot briefly shows the full bar; a release, a cancel
    // (ball lost) or a tackle instead hides it at once.
    if (msg.action === 'shot' && msg.charge >= 1 && shotBar.isCharging()) shotBar.complete();
    else if (['shot', 'shot_cancel', 'standing_tackle'].includes(msg.action)) shotBar.stop();
  });
  events.on(SERVER.STATE, (msg) => {
    const me = msg.players?.find((p) => p.id === state.myId);
    if (!me || !shotBar.isCharging() || me.charging || serverChargeStartedAt === null) return;
    // Drop a bar the server stopped backing before full charge (at full charge
    // the 'shot' result drives the bar). Both times here are server times.
    const held = msg.serverTime - serverChargeStartedAt;
    if (held > 150 && held < SHOT_MAX_CHARGE_MS) shotBar.stop();
  });

  function clearGameInput() {
    cancelShotCharge();
    for (const code of Object.values(preferences.get().keys)) pressed[code] = false;
    if (network.isOpen()) network.send({ type: CLIENT.INPUT, x: 0, z: 0, sprint: false });
  }
  function isTypingTarget(target) {
    return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
  }
  window.addEventListener('keydown', (event) => {
    if (settings.handleKeydown(event)) return;
    if (isBound('menu', event.code) && isMatchPhase(state.phase) && !state.waitingInLobby && state.joined) {
      event.preventDefault();
      if (!event.repeat) ui.setMatchMenu(ui.dom.matchMenu.hidden);
      return;
    }
    if (!ui.dom.matchMenu.hidden && event.code === 'Tab') {
      event.preventDefault();
      (document.activeElement === ui.dom.resumeBtn ? ui.dom.leaveMatchBtn : ui.dom.resumeBtn).focus();
      return;
    }
    if (state.phase !== 'playing' || state.waitingInLobby || !ui.dom.matchMenu.hidden || !state.joined || isTypingTarget(event.target) || !anyGameKey(event.code)) return;
    event.preventDefault();
    // OS auto-repeat never starts anything: after an input reset (restart, menu)
    // a key still held from before would otherwise begin a charge late.
    if (!pressed[event.code] && !event.repeat && network.isOpen()) {
      if (isBound('shoot', event.code)) {
        shootHeld = true;
        shotPressedAt = performance.now();
        serverChargeStartedAt = null;
        shotBar.stop();
        network.send({ type: CLIENT.SHOT_CHARGE_START });
      } else if (!shootHeld) {
        // Pass/cross are ignored while S is held.
        const action = isBound('pass', event.code) ? 'A' : isBound('cross', event.code) ? 'D' : null;
        if (action) network.send({ type: CLIENT.ACTION, key: action });
      }
    }
    pressed[event.code] = true;
  });
  window.addEventListener('keyup', (event) => {
    if (!anyGameKey(event.code)) return;
    pressed[event.code] = false;
    if (isBound('shoot', event.code) && shootHeld) {
      shootHeld = false;
      shotPressedAt = serverChargeStartedAt = null;
      shotBar.stop();
      // The server shoots with the charge it measured; ignored if it already fired.
      if (network.isOpen()) network.send({ type: CLIENT.SHOT_RELEASE });
    }
  });
  window.addEventListener('blur', clearGameInput);

  let lastInputSend = 0;
  function sendInput(now) {
    if (state.phase !== 'playing' || state.waitingInLobby || !ui.dom.matchMenu.hidden || settings.isOpen() || !state.joined || !network.isOpen() || now - lastInputSend < 50) return;
    lastInputSend = now;
    let x = 0, z = 0;
    // Camera-relative controls for the fixed +X broadcast camera.
    if (pressed[preferences.get().keys.moveUp]) x -= 1;
    if (pressed[preferences.get().keys.moveDown]) x += 1;
    if (pressed[preferences.get().keys.moveLeft]) z += 1;
    if (pressed[preferences.get().keys.moveRight]) z -= 1;
    const length = Math.hypot(x, z) || 1;
    network.send({ type: CLIENT.INPUT, x: x / length, z: z / length, sprint: !!pressed[preferences.get().keys.sprint] });
  }
  return { clearGameInput, cancelShotCharge, sendInput };
}
