import { isMatchPhase } from '../../shared/matchPhases.js';
import { createGoalSequence } from './goalSequence.js';
import { SERVER } from '../network/protocol.js';
export function createMessageHandler({ state, ui, lobby, players, ball, controls, canvas, events, audio, camera }) {
const goalSequence = createGoalSequence({ presentation: ui.goalPresentation, camera, audio, controls });
// Highest out-of-play event already shown; server IDs increase for its lifetime.
let shownOutEvent = 0;
function clearMatchPresentation(resetHistory = false) {
  goalSequence.clear(resetHistory);
  ui.outNotice.hide();
  if (resetHistory) shownOutEvent = 0;
}
// Snapshots leave the server at serverTime and arrive a little later, so the
// largest offset among the last CLOCK_SAMPLE_WINDOW samples (~2 s) is the best
// estimate of the server clock. There is no smoothing, so the estimate never
// runs slower or faster than real time; old samples simply leave the window if
// either clock is adjusted. Only the match clock reads this (the shot bar runs
// on the local clock from the S press).
const CLOCK_SAMPLE_WINDOW = 40;
const clockSamples = [];
function syncServerClock(serverTime) {
  clockSamples.push(serverTime - Date.now());
  if (clockSamples.length > CLOCK_SAMPLE_WINDOW) clockSamples.shift();
  state.serverClockOffset = Math.max(...clockSamples);
}
// AUT / TAÇ / KORNER: shown once per server out event, seeked by server time;
// the restart snapshot (or any return to play) removes it.
function syncOutOfPlay(msg) {
  if (msg.phase === 'outOfPlay' && msg.outEvent) {
    if (msg.outEvent.id > shownOutEvent) {
      shownOutEvent = msg.outEvent.id;
      controls.clearGameInput();
      ui.outNotice.show(msg.outEvent, msg.serverTime);
      if (msg.serverTime - msg.outEvent.startedAt < 600) audio.playSfx('whistle');
    }
  } else {
    ui.outNotice.hide();
  }
}
function handleMessage(msg) {
    if (msg.teams) state.teams = msg.teams;
    events.emit(msg.type, msg);
  if (msg.type === SERVER.LOBBY) {
    if (msg.positions) state.positionsData = msg.positions;
    state.phase = msg.phase;
    state.isHost = msg.hostId === state.myId;
    if (!state.joined) return;
    const self = msg.players.find((p) => p.id === state.myId);
    if (isMatchPhase(state.phase) && self && !self.inMatch) state.waitingInLobby = true;
    if (state.pendingJoin && msg.players.some((p) => p.id === state.myId)) {
      console.log('[JOIN] Lobby accepted');
      state.pendingJoin.resolve();
      state.pendingJoin = null;
    }
    lobby.renderLobby(msg);
    if (state.phase === 'lobby' || state.phase === 'countdown') state.waitingInLobby = false;
    if (state.phase === 'lobby' || state.phase === 'countdown' || state.waitingInLobby) {
      if (!isMatchPhase(state.phase)) clearMatchPresentation();
      if (ui.dom.lobbyOverlay.hidden) console.log('[JOIN] Switching UI to lobby');
      if (ui.dom.lobbyOverlay.hidden) ui.showOverlay(ui.dom.lobbyOverlay);
      audio.setLobbyActive(true);
      ui.dom.hud.hidden = true; ui.dom.hint.hidden = true;
      players.clearEntities();
      ball.reset();
      if (state.phase === 'lobby') ui.hideCountdownOverlay();
    }
    if (msg.score) { state.lastScore = { ...msg.score }; ui.applyStateHUD(msg); }
  } else if (msg.type === SERVER.PROFILE_ERROR) {
    if (state.pendingJoin) state.pendingJoin.reject(new Error(msg.message));
  } else if (msg.type === SERVER.SLOT_ERROR) {
    ui.dom.slotStatus.textContent = msg.message;
  } else if (msg.type === SERVER.WELCOME) {
    state.myId = msg.id;
    state.isHost = msg.isHost;
    state.joined = true;
    state.positionsData = msg.positions;
  } else if (msg.type === SERVER.LOBBY_RETURNED) {
    clearMatchPresentation();
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
    clearMatchPresentation();
    state.waitingInLobby = false;
    controls.clearGameInput();
    // Server-authoritative transition: every client switches to the pitch
    // because the server said so, not because each one independently
    // decided its first 'state' packet had arrived.
    state.serverMatchStartedAt = msg.startedAt;
    state.serverMatchEndsAt = msg.endsAt;
    // The server sends this at startedAt; snapshots refine the offset with serverTime.
    syncServerClock(msg.startedAt);
    ui.hideCountdownOverlay();
    state.phase = 'playing';
    ui.showOverlay(null);
    audio.setLobbyActive(false);
    audio.playSfx('whistle');
    state.lastScore = { blue: 0, red: 0 };
    ui.dom.hud.hidden = false; ui.dom.hint.hidden = false;
    canvas.focus({ preventScroll: true });
  } else if ([SERVER.STATE, SERVER.GOAL, SERVER.KICKOFF_RESET, SERVER.OUT_OF_PLAY, SERVER.RESTART].includes(msg.type)) {
    if (!state.joined) return;
    const nextPhase = msg.phase || 'playing';
    if (!isMatchPhase(nextPhase)) return;
    // Mid-match arrivals retain the existing waiting-lobby policy, but still
    // cache the authoritative phase, score and active goal for reconnect safety.
    state.activeGoal = msg.goalEvent || null;
    const transition = goalSequence.sync(msg);
    if (transition.ignore) return;
    if (state.waitingInLobby) {
      state.phase = nextPhase;
      state.lastScore = { ...msg.score }; ui.applyStateHUD(msg);
      return;
    }
    if (typeof msg.startedAt === 'number' && msg.startedAt > 0) state.serverMatchStartedAt = msg.startedAt;
    if (typeof msg.endsAt === 'number' && msg.endsAt > 0) state.serverMatchEndsAt = msg.endsAt;
    if (typeof msg.serverTime === 'number') syncServerClock(msg.serverTime);
    syncOutOfPlay(msg);
    if (nextPhase === 'goalCelebration' && state.phase !== nextPhase) ui.setMatchMenu(false);
    state.phase = nextPhase;
    if (!ui.dom.lobbyOverlay.hidden || ui.dom.hud.hidden) {
      ui.showOverlay(null);
      audio.setLobbyActive(false);
      ui.dom.hud.hidden = false;
      canvas.focus({ preventScroll: true });
    }
    ui.dom.hint.hidden = nextPhase !== 'playing';
    // Restarts place players and ball directly; snap instead of gliding there.
    applyState(msg, transition.snap || msg.type === SERVER.RESTART);
  } else if (msg.type === SERVER.MATCH_END) {
    clearMatchPresentation();
    state.phase = 'ended';
    if (state.waitingInLobby) return;
    ui.showMatchEnd(msg);
    audio.setLobbyActive(false);
  }
}

function applyState(msg, snap = false) {
  if (msg.score) state.lastScore = { ...msg.score };
  ui.applyStateHUD(msg); players.applySnapshot(msg.players, snap); ball.applySnapshot(msg.ball, snap);
}
return { handleMessage, clearGoalSequence: clearMatchPresentation };
}
