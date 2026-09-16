import { createWebSocketClient } from './websocket.js';
import { CLIENT } from './protocol.js';

// Connection/session presentation, separate from raw transport and 3D objects.
export function createSession({ state, ui, players, onMessage }) {
  const network = createWebSocketClient({
    getConnection: () => ({ name: ui.dom.nameInput.value.trim(), serverUrl: ui.dom.serverInput.value }),
    onStatus(status, url) {
      if (url) ui.dom.serverInput.value = url;
      ui.dom.connectBtn.disabled = status === 'connecting';
      ui.updateConnectionStatus(status, url);
    },
    onMessage,
    onClose() {
      state.phase = 'idle';
      state.waitingInLobby = false;
      ui.hideCountdownOverlay();
      ui.setMatchMenu(false);
      if (state.pendingJoin) state.pendingJoin.reject(new Error('Sunucuyla bağlantı kesildi.'));
      ui.dom.connectBtn.disabled = false;
      if (state.joined) {
        ui.dom.disconnectMsg.textContent = 'Sunucuyla bağlantı koptu.';
        ui.updateConnectionStatus('disconnected');
        ui.showOverlay(ui.dom.disconnectOverlay);
        ui.dom.hud.hidden = ui.dom.hint.hidden = true;
        players.clearEntities();
        state.joined = false;
        state.myId = null;
      } else ui.updateConnectionStatus('failed');
    },
  });
  return { ...network, leaveMatch: () => network.send({ type: CLIENT.LEAVE_MATCH }) };
}
