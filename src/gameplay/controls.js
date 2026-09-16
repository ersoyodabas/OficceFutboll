import { isMatchPhase } from '../../shared/matchPhases.js';
import { CLIENT } from '../network/protocol.js';

export function createControls({ state, ui, network, preferences, settings }) {
  const pressed = Object.create(null);
  const isBound = (name, code) => preferences.get().keys[name] === code;
  const anyGameKey = (code) => Object.values(preferences.get().keys).includes(code);

  function clearGameInput() {
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
    const action = isBound('pass', event.code) ? 'A' : isBound('shoot', event.code) ? 'S' : isBound('cross', event.code) ? 'D' : null;
    if (!pressed[event.code] && action && network.isOpen()) network.send({ type: CLIENT.ACTION, key: action });
    pressed[event.code] = true;
  });
  window.addEventListener('keyup', (event) => { if (anyGameKey(event.code)) pressed[event.code] = false; });
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
  return { clearGameInput, sendInput };
}
