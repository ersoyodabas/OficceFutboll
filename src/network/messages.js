import { SERVER } from '../network/protocol.js';
export function createMessageHandler({ state, ui, lobby, players, ball, controls, canvas, events, audio }) {
function handleMessage(msg) {
    events.emit(msg.type, msg);
  if (msg.type === SERVER.LOBBY) {
    if (msg.positions) state.positionsData = msg.positions;
    state.phase = msg.phase;
    state.isHost = msg.hostId === state.myId;
    if (!state.joined) return;
    const self = msg.players.find((p) => p.id === state.myId);
    if (state.phase === 'playing' && self && !self.inMatch) state.waitingInLobby = true;
    if (state.pendingJoin && msg.players.some((p) => p.id === state.myId)) {
      console.log('[JOIN] Lobby accepted');
      state.pendingJoin.resolve();
      state.pendingJoin = null;
    }
    lobby.renderLobby(msg);
    if (state.phase === 'lobby' || state.phase === 'countdown') state.waitingInLobby = false;
    if (state.phase === 'lobby' || state.phase === 'countdown' || state.waitingInLobby) {
      if (ui.dom.lobbyOverlay.hidden) console.log('[JOIN] Switching UI to lobby');
      ui.showOverlay(ui.dom.lobbyOverlay);
      audio.setLobbyActive(true);
      ui.dom.hud.hidden = true; ui.dom.hint.hidden = true;
      players.clearEntities();
      ball.reset();
      if (state.phase === 'lobby') ui.hideCountdownOverlay();
    }
    // Mid-match LOBBY broadcasts (e.g. right after a goal) also carry the
    // score; only resync it here outside of active play so a goal isn't
    // masked before the STATE message can detect the increase.
    if (msg.phase !== 'playing') state.lastScore = { ...msg.score };
  } else if (msg.type === SERVER.SLOT_ERROR) {
    ui.dom.slotStatus.textContent = msg.message;
  } else if (msg.type === SERVER.WELCOME) {
    state.myId = msg.id;
    state.isHost = msg.isHost;
    state.joined = true;
    state.positionsData = msg.positions;
  } else if (msg.type === SERVER.LOBBY_RETURNED) {
    state.waitingInLobby = true;
    controls.clearGameInput();
    ui.showOverlay(ui.dom.lobbyOverlay);
    audio.setLobbyActive(true);
    ui.dom.hud.hidden = true; ui.dom.hint.hidden = true;
    players.clearEntities();
    ui.hideCountdownOverlay();
    ui.dom.$('pitchSlots').querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
  } else if (msg.type === SERVER.COUNTDOWN_START) {
    ui.showCountdownOverlay(msg.startAt, msg.duration);
  } else if (msg.type === SERVER.COUNTDOWN_CANCELLED) {
    ui.hideCountdownOverlay();
  } else if (msg.type === SERVER.MATCH_START) {
    state.waitingInLobby = false;
    controls.clearGameInput();
    // Server-authoritative transition: every client switches to the pitch
    // because the server said so, not because each one independently
    // decided its first 'state' packet had arrived.
    state.serverMatchStartedAt = msg.startedAt;
    ui.hideCountdownOverlay();
    state.phase = 'playing';
    ui.showOverlay(null);
    audio.setLobbyActive(false);
    audio.playSfx('whistle');
    state.lastScore = { blue: 0, red: 0 };
    ui.dom.hud.hidden = false; ui.dom.hint.hidden = false;
    canvas.focus({ preventScroll: true });
  } else if (msg.type === SERVER.STATE) {
    if (state.waitingInLobby || !state.joined) return;
    if (typeof msg.startedAt === 'number' && msg.startedAt > 0) state.serverMatchStartedAt = msg.startedAt;
    if (state.phase !== 'playing') {
      // fallback for a client that connects mid-match and so never saw the
      // one-shot 'matchStart' (e.g. reconnect, or a late joiner who ends up
      // spectating since they can't be placed into an already-running match)
      state.phase = 'playing';
      ui.showOverlay(null);
      audio.setLobbyActive(false);
      ui.dom.hud.hidden = false; ui.dom.hint.hidden = false;
      canvas.focus({ preventScroll: true });
    }
    applyState(msg);
  } else if (msg.type === SERVER.MATCH_END) {
    state.phase = 'ended';
    if (state.waitingInLobby) return;
    ui.showMatchEnd(msg);
    audio.setLobbyActive(false);
  }
}

function applyState(msg) {
  if (msg.score && (msg.score.blue > state.lastScore.blue || msg.score.red > state.lastScore.red)) audio.playSfx('goal');
  if (msg.score) state.lastScore = { ...msg.score };
  ui.applyStateHUD(msg); players.applySnapshot(msg.players); ball.applySnapshot(msg.ball);
}
return { handleMessage };
}
