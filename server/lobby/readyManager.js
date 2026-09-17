import { SERVER } from '../../src/network/protocol.js';
import { MIN_PLAYERS_TO_START, COUNTDOWN_SECONDS } from '../core/config.js';
import { validateClubSelections } from '../../shared/kitClash.js';
export function createReadyManager({ state, broadcast, broadcastLobby }) {
function areAllPlayersReady() {
  if (state.clients.size === 0) return false;
  for (const c of state.clients.values()) if (!c.ready || !Number.isInteger(c.slot)) return false;
  return true;
}

function canStartCountdown() {
  return state.phase === 'lobby' && !validateClubSelections(state.teams) && state.clients.size >= MIN_PLAYERS_TO_START && areAllPlayersReady();
}

function startCountdown() {
  state.phase = 'countdown';
  state.countdownStartAt = Date.now();
  state.countdownRemaining = COUNTDOWN_SECONDS;
  broadcastLobby();
  broadcast({ type: SERVER.COUNTDOWN_START, startAt: state.countdownStartAt, duration: COUNTDOWN_SECONDS * 1000 });
}

// keepReady is for a player who simply took their own readiness back: the
// line-up did not change, so the others keep the readiness they already gave.
function cancelCountdown({ keepReady = false } = {}) {
  if (state.phase !== 'countdown') return;
  state.phase = 'lobby';
  // A changed line-up (join, leave) requires everyone to re-confirm rather than
  // silently resuming with potentially-stale ready flags (see README "Davet
  // Linki" notes on the join-during-countdown decision).
  if (!keepReady) for (const c of state.clients.values()) c.ready = false;
  broadcast({ type: SERVER.COUNTDOWN_CANCELLED });
  broadcastLobby();
}

function checkAutoStart() {
  if (canStartCountdown()) startCountdown();
}

return { cancelCountdown, checkAutoStart };
}
