import { SERVER } from '../../src/network/protocol.js';
import { getClub, getKit } from '../../shared/clubs.js';
import { validateClubSelections } from '../../shared/kitClash.js';

export function captainFor(state, team) {
  return [...state.clients.values()].filter((c) => !c.isAI && c.team === team)
    .sort((a, b) => (a.sideJoinedOrder || 0) - (b.sideJoinedOrder || 0) || a.id.localeCompare(b.id))[0]?.id || null;
}
export function teamSelections(state) {
  return Object.fromEntries(['blue', 'red'].map((team) => [team, { ...state.teams[team], captainId: captainFor(state, team) }]));
}
export function createClubManager({ state, send, broadcastLobby }) {
  function selectClubKit(client, msg) {
    const reject = (message) => send(client.ws, { type: SERVER.CLUB_ERROR, message });
    if (state.phase !== 'lobby') return reject('Kulüp ve forma yalnızca maç öncesi lobide değiştirilebilir.');
    const team = client.team;
    if (!['blue', 'red'].includes(team) || captainFor(state, team) !== client.id) return reject('Bu seçimi yalnızca takım kaptanı yapabilir.');
    if (!getClub(msg.clubId) || !getKit(msg.clubId, msg.kitId)) return reject('Geçerli bir kulüp ve forma seç.');
    const candidate = { ...state.teams, [team]: { clubId: msg.clubId, kitId: msg.kitId } };
    const error = validateClubSelections(candidate);
    if (error) return reject(error);
    if (state.teams[team].clubId !== msg.clubId || state.teams[team].kitId !== msg.kitId) {
      state.teams[team] = candidate[team];
      // Both sides must approve the newly visible matchup before a countdown.
      for (const player of state.clients.values()) player.ready = false;
    }
    broadcastLobby();
  }
  return { selectClubKit };
}
