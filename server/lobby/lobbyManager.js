import { FIELD } from '../../shared/field.js';
import { SERVER } from '../../src/network/protocol.js';
import { MIN_PLAYERS_TO_START, POSITIONS } from '../core/config.js';
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
    countdown: state.phase === 'countdown' ? Math.ceil(state.countdownRemaining) : null,
    players: rosterPayload(),
    score: state.score,
    hostId: state.hostId,
    minPlayers: MIN_PLAYERS_TO_START,
    positions: POSITIONS,
  });
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
      client.team = team;
      client.slot = slot;
      client.position = FIELD.LOBBY_SLOTS[slot].position;
      client.ready = false;
      broadcastLobby();
}
function setReady(client, value) {
      if (state.phase !== 'lobby') return; // can't change readiness once counting down or in-match
      if (!Number.isInteger(client.slot)) {
        send(client.ws, { type: SERVER.SLOT_ERROR, message: 'Hazır olmadan önce sahada bir yer seç.' });
        return;
      }
      client.ready = !!value;
      broadcastLobby();
      return true;
}
return { rosterPayload, broadcastLobby, selectSlot, setReady };
}
