import { FIELD } from '../../shared/field.js';
import { SERVER } from '../../src/network/protocol.js';
import { MIN_PLAYERS_TO_START, POSITIONS } from '../core/config.js';
import { validatePlayerName } from '../../shared/playerName.js';
import { teamSelections } from './clubManager.js';
import { validateClubSelections } from '../../shared/kitClash.js';
export function createLobbyManager({ state, broadcast, send }) {
function rosterPayload() {
  return Array.from(state.clients.values()).map((c) => ({
    id: c.id, name: c.name, team: c.team, position: c.position, isHost: c.id === state.hostId, ready: !!c.ready,
    inMatch: !!c.inMatch, isAI: !!c.isAI, slot: c.slot ?? null,
  }));
}

function broadcastLobby() {
  broadcast({
    type: SERVER.LOBBY,
    phase: state.phase,
    teams: teamSelections(state),
    countdown: state.phase === 'countdown' ? Math.ceil(state.countdownRemaining) : null,
    players: rosterPayload(),
    score: state.score,
    hostId: state.hostId,
    minPlayers: MIN_PLAYERS_TO_START,
    positions: POSITIONS,
  });
}

function updateProfile(client, value) {
  if (client.inMatch) {
    send(client.ws, { type: SERVER.PROFILE_ERROR, message: 'Adını değiştirmek için lobiye dön.' });
    return;
  }
  const result = validatePlayerName(value);
  if (result.error) {
    send(client.ws, { type: SERVER.PROFILE_ERROR, message: result.error });
    return;
  }
  client.name = result.name;
  // A cosmetic edit must not alter identity, position, ready state or countdown.
  broadcastLobby();
  send(client.ws, { type: SERVER.PROFILE_UPDATED, id: client.id, name: client.name });
}
function selectSlot(client, team, slot) {
      if (state.phase === 'countdown' || client.inMatch) return;
      if (!['blue', 'red'].includes(team) || !Number.isInteger(slot) || !FIELD.LOBBY_SLOTS[slot]) {
        send(client.ws, { type: SERVER.SLOT_ERROR, message: 'Sahadaki boş yerlerden birini seç.' });
        return;
      }
      const occupied = Array.from(state.clients.values()).some((c) => !c.isAI && c.id !== client.id && c.team === team && c.slot === slot);
      if (occupied) {
        send(client.ws, { type: SERVER.SLOT_ERROR, message: 'Bu yeri başka bir oyuncu seçti. Boş bir yere tıkla.' });
        return;
      }
      if (client.team === team && client.slot === slot) return;
      if (client.team !== team) client.sideJoinedOrder = ++state.sideJoinSequence;
      client.team = team;
      client.slot = slot;
      client.position = FIELD.LOBBY_SLOTS[slot].position;
      client.ready = false;
      broadcastLobby();
}
// Returns true when the readiness actually changed, so the caller can start or
// cancel a countdown. Taking readiness back during the countdown is allowed and
// stops the match from starting; everything else is lobby-phase only.
function setReady(client, value) {
      if (state.phase === 'countdown') return !value && client.ready ? (client.ready = false, true) : false;
      if (state.phase !== 'lobby') return false; // in-match readiness is owned by the match
      const error = value && validateClubSelections(state.teams);
      if (error) { send(client.ws, { type: SERVER.SLOT_ERROR, message: error }); return; }
      if (!Number.isInteger(client.slot)) {
        send(client.ws, { type: SERVER.SLOT_ERROR, message: 'Hazır olmadan önce sahada bir yer seç.' });
        return;
      }
      client.ready = !!value;
      broadcastLobby();
      return true;
}
return { rosterPayload, broadcastLobby, selectSlot, setReady, updateProfile };
}
