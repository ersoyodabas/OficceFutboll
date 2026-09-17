import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../core/gameState.js';
import { createLobbyManager } from '../lobby/lobbyManager.js';
import { createClubManager, captainFor } from '../lobby/clubManager.js';
import { createReadyManager } from '../lobby/readyManager.js';
import { createMatchManager } from '../gameplay/matchManager.js';
import { createPlayerManager } from '../gameplay/playerManager.js';
import { buildWorld } from '../gameplay/ballPhysics.js';
import { CLUBS, getKit } from '../../shared/clubs.js';
import { kitsClash, validateClubSelections } from '../../shared/kitClash.js';
import { validatePlayerName } from '../../shared/playerName.js';

function fixture() {
  const state = createGameState(), messages = [];
  const broadcast = (m) => messages.push(structuredClone(m));
  const send = (ws, m) => messages.push({ ...structuredClone(m), recipient: ws });
  const lobby = createLobbyManager({ state, broadcast, send });
  const clubs = createClubManager({ state, send, ...lobby });
  const ready = createReadyManager({ state, broadcast, ...lobby });
  const players = createPlayerManager({ state });
  const match = createMatchManager({ state, broadcast, ...lobby, ...players, buildWorld });
  const add = (id, team, slot) => {
    const player = { id, ws: id, name: id, team: null, ready: false, inMatch: false, slot: null };
    state.clients.set(id, player); if (team) lobby.selectSlot(player, team, slot); return player;
  };
  return { state, messages, lobby, clubs, ready, match, add };
}

test('name validation supports Turkish, trims whitespace and rejects invalid/oversize input', () => {
  assert.deepEqual(validatePlayerName('  Ersoy   Odabaş '), { name: 'Ersoy Odabaş' });
  assert.equal(validatePlayerName('Yıldıray').name, 'Yıldıray');
  for (const input of ['', '   ', '<script>', '\u200b', 'A\nB', 'A'.repeat(21), '---', {}, null]) assert.ok(validatePlayerName(input).error);
  assert.ok(validatePlayerName('a'.repeat(20)).name);
});

test('profile changes broadcast confirmed name without changing ready/team/identity/countdown', () => {
  const { state, messages, lobby, add } = fixture();
  const a = add('a', 'blue', 4); add('b', 'red', 4);
  a.ready = true; state.phase = 'countdown'; state.countdownStartAt = 123;
  lobby.updateProfile(a, '  Ersoy  ');
  assert.equal(a.name, 'Ersoy'); assert.equal(a.ready, true); assert.equal(a.team, 'blue'); assert.equal(a.slot, 4);
  assert.equal(state.phase, 'countdown'); assert.equal(state.countdownStartAt, 123);
  assert.equal(messages.at(-2).players.find((p) => p.id === 'a').name, 'Ersoy');
  assert.equal(messages.at(-1).type, 'profileUpdated');
  for (const invalid of ['', ' '.repeat(3), 'X'.repeat(21), '<b>']) {
    lobby.updateProfile(a, invalid); assert.equal(messages.at(-1).type, 'profileError'); assert.equal(a.name, 'Ersoy');
  }
  a.inMatch = true; lobby.updateProfile(a, 'Changed'); assert.equal(a.name, 'Ersoy');
});

test('club catalog is complete, original and has usable kits without assets', () => {
  assert.equal(CLUBS.length, 21);
  for (const club of CLUBS) {
    assert.equal(club.badge, null); assert.equal(club.kits.length, 3);
    for (const kit of club.kits) { assert.match(kit.primaryColor, /^#[0-9a-f]{6}$/i); assert.equal(kit.texture, null); }
  }
  for (const a of CLUBS.flatMap((c) => c.kits)) for (const b of CLUBS.flatMap((c) => c.kits)) {
    assert.equal(kitsClash(a, b), kitsClash(b, a), 'clash decisions do not depend on home/away ordering');
  }
});

test('captains, atomic selection conflicts, readiness invalidation and deterministic transfer', () => {
  const { state, messages, lobby, clubs, add } = fixture();
  const first = add('z-first', 'blue', 4), second = add('a-second', 'blue', 3), opponent = add('opponent', 'red', 4);
  assert.equal(captainFor(state, 'blue'), first.id);
  clubs.selectClubKit(second, { clubId: 'galatasaray', kitId: 'home' }); assert.equal(messages.at(-1).type, 'club_error');
  for (const p of state.clients.values()) p.ready = true;
  clubs.selectClubKit(first, { clubId: 'galatasaray', kitId: 'home' });
  assert.equal(state.teams.blue.clubId, 'galatasaray'); assert.ok([...state.clients.values()].every((p) => !p.ready));
  clubs.selectClubKit(opponent, { clubId: 'galatasaray', kitId: 'away' });
  assert.equal(messages.at(-1).type, 'club_error'); assert.equal(state.teams.red.clubId, 'man-city');
  clubs.selectClubKit(first, { clubId: 'galatasaray', kitId: 'third' }); assert.equal(state.teams.blue.kitId, 'third');
  clubs.selectClubKit(first, { clubId: 'missing', kitId: 'home' }); assert.equal(messages.at(-1).type, 'club_error');
  clubs.selectClubKit(first, { clubId: 'arsenal', kitId: 'missing' }); assert.equal(messages.at(-1).type, 'club_error');
  // Changing positions on the same side does not transfer captaincy.
  lobby.selectSlot(first, 'blue', 2); assert.equal(captainFor(state, 'blue'), first.id);
  state.clients.delete(first.id); assert.equal(captainFor(state, 'blue'), second.id);
  clubs.selectClubKit(second, { clubId: 'arsenal', kitId: 'home' }); assert.equal(state.teams.blue.clubId, 'arsenal');
  state.phase = 'playing'; clubs.selectClubKit(second, { clubId: 'chelsea', kitId: 'home' }); assert.equal(state.teams.blue.clubId, 'arsenal');
});

test('kit clashes are rejected on selection, ready, countdown and final start', () => {
  const { state, messages, clubs, lobby, ready, match, add } = fixture();
  const a = add('a', 'blue', 4), b = add('b', 'red', 4);
  assert.ok(kitsClash(getKit('arsenal', 'away'), getKit('real-madrid', 'home')));
  assert.ok(kitsClash(getKit('psg', 'third'), getKit('besiktas', 'home')));
  assert.equal(validateClubSelections(state.teams), null);
  clubs.selectClubKit(a, { clubId: 'arsenal', kitId: 'away' });
  clubs.selectClubKit(b, { clubId: 'real-madrid', kitId: 'home' });
  assert.equal(messages.at(-1).type, 'club_error');
  state.teams.red = { clubId: 'real-madrid', kitId: 'home' };
  lobby.setReady(a, true); assert.equal(a.ready, false);
  a.ready = b.ready = true; ready.checkAutoStart(); assert.equal(state.phase, 'lobby');
  state.phase = 'countdown'; match.startMatch(); assert.equal(state.phase, 'lobby'); assert.equal(state.world, null);
});

test('the countdown starts when everyone is ready and stops when someone takes it back', () => {
  const { state, lobby, ready, add } = fixture();
  const a = add('a', 'blue', 4), b = add('b', 'red', 4);
  assert.equal(lobby.setReady(a, true), true);
  ready.checkAutoStart();
  assert.equal(state.phase, 'lobby', 'one ready player is not everyone');
  lobby.setReady(b, true);
  ready.checkAutoStart();
  assert.equal(state.phase, 'countdown');
  assert.equal(lobby.setReady(a, true), false, 'confirming again changes nothing');
  assert.equal(lobby.setReady(a, false), true, 'a player may take readiness back mid-countdown');
  ready.cancelCountdown({ keepReady: true });
  assert.equal(state.phase, 'lobby');
  assert.equal(a.ready, false);
  assert.equal(b.ready, true, 'the line-up did not change, so the others stay ready');
  ready.checkAutoStart();
  assert.equal(state.phase, 'lobby', 'the match cannot start until everyone is ready again');
  // A changed line-up (someone joining or leaving) still resets everybody.
  lobby.setReady(a, true); ready.checkAutoStart();
  assert.equal(state.phase, 'countdown');
  ready.cancelCountdown();
  assert.ok([...state.clients.values()].every((player) => !player.ready));
});

test('club selections reach match and goal, then reset as lobby state', () => {
  const { state, messages, clubs, match, add } = fixture();
  const a = add('a', 'blue', 4); add('b', 'red', 4);
  clubs.selectClubKit(a, { clubId: 'galatasaray', kitId: 'home' }); match.startMatch();
  assert.equal(messages.findLast((m) => m.type === 'matchStart').teams.blue.clubId, 'galatasaray');
  match.confirmGoal('blue');
  const goal = messages.findLast((m) => m.type === 'goal');
  assert.equal(goal.goalEvent.teamName, 'Galatasaray'); assert.equal(goal.goalEvent.teamInitials, 'GS');
  assert.equal(goal.teams.blue.kitId, 'home');
  match.abortMatchToLobby(); assert.equal(state.teams.blue.clubId, 'arsenal');
});
