import { SERVER } from '../../src/network/protocol.js';
import { MIN_PLAYERS_TO_START, COUNTDOWN_SECONDS } from '../core/config.js';
export function createReadyManager({ state, broadcast, broadcastLobby }) {
function areAllPlayersReady() {
  if (state.clients.size === 0) return false;
  for (const c of state.clients.values()) if (!c.ready || !Number.isInteger(c.slot)) return false;
  return true;
}

function canStartCountdown() {
  return state.phase === 'lobby' && state.clients.size >= MIN_PLAYERS_TO_START && areAllPlayersReady();
}

function startCountdown() {
  state.phase = 'countdown';
  state.countdownStartAt = Date.now();
  state.countdownRemaining = COUNTDOWN_SECONDS;
  broadcastLobby();
  broadcast({ type: SERVER.COUNTDOWN_START, startAt: state.countdownStartAt, duration: COUNTDOWN_SECONDS * 1000 });
}

function cancelCountdown() {
  if (state.phase !== 'countdown') return;
  state.phase = 'lobby';
  // require everyone to re-confirm readiness rather than silently resuming
  // with potentially-stale ready flags (see README "Davet Linki" notes on
  // the join-during-countdown decision)
  for (const c of state.clients.values()) c.ready = false;
  broadcast({ type: SERVER.COUNTDOWN_CANCELLED });
  broadcastLobby();
}

function checkAutoStart() {
  if (canStartCountdown()) startCountdown();
}

return { cancelCountdown, checkAutoStart };
}
