import { isMatchPhase } from '../../shared/matchPhases.js';
import { matchSnapshot } from '../gameplay/snapshot.js';
import { CLIENT, SERVER } from '../../src/network/protocol.js';
import { MIN_PLAYERS_TO_START, POSITIONS, DEFAULT_POSITION } from '../core/config.js';
import { HALF_W, HALF_L, GOAL_HALF_W, GOAL_HEIGHT, BALL_R, PLAYER_R, FIELD } from '../../shared/field.js';
import crypto from 'node:crypto';
import { validatePlayerName } from '../../shared/playerName.js';
import { defaultClubSelections } from '../../shared/clubs.js';

const LOBBY_SFX_COOLDOWN_MS = 3000;

export function createConnectionHandler({ state, send, broadcast, broadcastLobby, rosterPayload, ready, actions, match, lobby, chat, clubs }) {
function onConnection(ws) {
  console.log('[SERVER] Connection opened');
  const id = crypto.randomUUID();
  const client = {
    id, ws, name: 'Oyuncu', team: null, slot: null, position: DEFAULT_POSITION, ready: false,
    inMatch: false, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    input: { x: 0, z: 0, sprint: false },
    facing: { x: 0, z: 1 }, cooldowns: { A: 0, S: 0, D: 0 },
    slideRemaining: 0, slideDirection: null, recoveryRemaining: 0, standingActive: 0, shotCharge: null, lastAction: null,
    lastSfxAt: 0,
  };
  let joined = false;

  // let a not-yet-joined socket see live team/position counts in its picker UI
  send(ws, { type: SERVER.LOBBY, phase: state.phase, countdown: null, players: rosterPayload(), score: state.score, hostId: state.hostId, minPlayers: MIN_PLAYERS_TO_START, positions: POSITIONS });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;

    if (msg.type === CLIENT.JOIN && !joined) {
      console.log('[SERVER] Join request received', { name: msg.name, team: msg.team, position: msg.position });
      const result = validatePlayerName(msg.name);
      if (result.error) { send(ws, { type: SERVER.PROFILE_ERROR, message: result.error }); return; }
      client.name = result.name;
      // Joining only enters the lobby; a place must be explicitly selected.
      state.clients.set(id, client);
      joined = true;
      console.log('[SERVER] Player joined:', client.name, 'Players online:', state.clients.size);
      if (!state.hostId) state.hostId = id;
      send(ws, { type: SERVER.WELCOME, id, isHost: id === state.hostId, field: { HALF_W, HALF_L, GOAL_HALF_W, GOAL_HEIGHT, BALL_R, PLAYER_R }, positions: POSITIONS });
      // A new player joining mid-countdown wasn't part of the readiness that
      // triggered it — cancel and make everyone (including them) re-confirm,
      // rather than silently starting a match they never agreed to join.
      ready.cancelCountdown();
      broadcastLobby();
      if (state.world && isMatchPhase(state.phase)) send(ws, { type: SERVER.STATE, ...matchSnapshot(state) });
      console.log('[SERVER] Broadcasting lobby state');
    } else if (msg.type === CLIENT.UPDATE_PROFILE && joined) {
      lobby.updateProfile(client, msg.name);
    } else if (msg.type === CLIENT.SELECT_CLUB_KIT && joined) {
      clubs.selectClubKit(client, msg);
    } else if (msg.type === CLIENT.LEAVE_MATCH && joined) {
      if (!isMatchPhase(state.phase)) return;
      client.inMatch = false;
      client.ready = false;
      client.shotCharge = null;
      client.input = { x: 0, z: 0, sprint: false };
      client.vel = { x: 0, z: 0 };
      client.slideRemaining = 0;
      client.slideDirection = null;
      client.recoveryRemaining = 0;
      client.standingActive = 0;
      if (state.ballOwnerId === id) actions.releaseBall();
      send(ws, { type: SERVER.LOBBY_RETURNED });
      if (!Array.from(state.clients.values()).some((c) => c.inMatch && !c.isAI)) match.abortMatchToLobby();
      else broadcastLobby();
    } else if (msg.type === CLIENT.SELECT_SLOT && joined) {
      lobby.selectSlot(client, msg.team, msg.slot);
    } else if (msg.type === CLIENT.READY && joined) {
      if (lobby.setReady(client, msg.ready)) ready.checkAutoStart();
    } else if (msg.type === CLIENT.INPUT && joined) {
      if (state.phase !== 'playing' || !client.inMatch) return;
      client.input = {
        x: Math.max(-1, Math.min(1, Number(msg.x) || 0)),
        z: Math.max(-1, Math.min(1, Number(msg.z) || 0)),
        sprint: msg.sprint === true,
      };
    } else if (msg.type === CLIENT.ACTION && joined) {
      actions.performAction(client, msg.key);
    } else if (msg.type === CLIENT.SHOT_CHARGE_START && joined) {
      // Any power/charge fields sent by the browser are ignored: the server times the hold.
      actions.startShotCharge(client);
    } else if (msg.type === CLIENT.SHOT_RELEASE && joined) {
      actions.releaseShot(client);
    } else if (msg.type === CLIENT.SHOT_CANCEL && joined) {
      actions.cancelShotCharge(client);
    } else if (msg.type === CLIENT.SEND_CHAT_MESSAGE && joined) {
      chat.addMessage(client, msg.message);
    } else if (msg.type === CLIENT.LOBBY_SFX && joined) {
      const now = Date.now();
      if (now - client.lastSfxAt < LOBBY_SFX_COOLDOWN_MS) return;
      client.lastSfxAt = now;
      broadcast({ type: SERVER.LOBBY_SFX, senderId: id, sfx: 'click' });
    }
  });

  ws.on('close', () => {
    if (!joined) return;
    state.clients.delete(id);
    if (state.clients.size === 0) state.teams = defaultClubSelections();
    if (id === state.hostId) {
      const next = state.clients.keys().next();
      state.hostId = next.done ? null : next.value;
    }
    broadcastLobby();
    if (state.phase === 'countdown') {
      // a departing player invalidates whatever readiness triggered this
      // countdown — cancel it unconditionally (cancelCountdown also covers
      // the "count dropped below MIN_PLAYERS_TO_START" case since the
      // countdown can't meaningfully continue either way)
      ready.cancelCountdown();
    } else if (isMatchPhase(state.phase)) {
      if (!Array.from(state.clients.values()).some((c) => c.inMatch && !c.isAI)) match.abortMatchToLobby();
    } else if (state.phase === 'lobby') {
      // someone who wasn't ready leaving might be exactly what was blocking
      // the remaining, already-ready players from starting
      ready.checkAutoStart();
    }
  });

  ws.on('error', () => {});

}

return { onConnection };
}
