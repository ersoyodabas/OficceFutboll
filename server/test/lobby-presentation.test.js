import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLUBS, getKit } from '../../shared/clubs.js';
import { kitsClash } from '../../shared/kitClash.js';
import { goalkeeperKit, GOALKEEPER_KITS } from '../../shared/goalkeeperKit.js';
import { teamAccent } from '../../src/lobby/teamAccent.js';
import { shirtNumberFor } from '../../src/gameplay/playerNumber.js';
import { JOINTS, IDLE_POSES, READY_POSES, samplePose, poseDuration, nextPose } from '../../src/lobby/lobbyPoses.js';

// The lobby presentation is client-side, but these pieces are pure data and can
// be checked here with the rest of the suite.

test('goalkeeper kits stand apart from both line-ups and never leave a keeper unkitted', () => {
  for (const kit of GOALKEEPER_KITS) {
    assert.match(kit.primaryColor, /^#[0-9a-f]{6}$/i);
    assert.equal(kit.goalkeeper, true);
    assert.equal(Object.isFrozen(kit), true, 'kits are reused, so they must be immutable');
  }
  let checked = 0;
  for (const home of CLUBS) {
    for (const away of CLUBS) {
      if (home === away) continue;
      const homeKit = getKit(home.id, 'home'), awayKit = getKit(away.id, 'home');
      if (kitsClash(homeKit, awayKit)) continue;          // never a legal matchup
      const keeper = goalkeeperKit(homeKit, awayKit);
      assert.ok(keeper, `${home.id} vs ${away.id}`);
      assert.ok(!kitsClash(keeper, homeKit) && !kitsClash(keeper, awayKit),
        `${home.name} vs ${away.name}: keeper kit ${keeper.id} clashes`);
      checked++;
    }
  }
  assert.ok(checked > 200, `checked ${checked} matchups`);
  // Same inputs, same kit: applying it again must not redraw the shirt.
  assert.equal(goalkeeperKit(getKit('arsenal', 'home'), getKit('man-city', 'home')),
    goalkeeperKit(getKit('arsenal', 'home'), getKit('man-city', 'home')));
  // The two keepers in a match never end up dressed the same.
  const home = getKit('arsenal', 'home'), away = getKit('man-city', 'home');
  const first = goalkeeperKit(home, away);
  const second = goalkeeperKit(away, home, [first]);
  assert.notEqual(second, first);
  assert.ok(!kitsClash(second, first) && !kitsClash(second, home) && !kitsClash(second, away));
});

test('team accent colours stay colourful for white, black and pale kits', () => {
  const brightness = (hex) => [1, 3, 5].reduce((sum, at) => sum + parseInt(hex.slice(at, at + 2), 16) / 255, 0) / 3;
  for (const club of CLUBS) {
    for (const kit of club.kits) {
      const accent = teamAccent(kit, club);
      assert.match(accent, /^#[0-9a-f]{6}$/);
      const light = brightness(accent);
      assert.ok(light > .2 && light < .88, `${club.id}/${kit.id} accent ${accent} is ${light}`);
    }
  }
  // A white shirt takes its colour from the club, not from the shirt.
  assert.notEqual(teamAccent(getKit('real-madrid', 'home'), CLUBS.find((c) => c.id === 'real-madrid')), '#ffffff');
  assert.equal(teamAccent(null, null), teamAccent(undefined, undefined), 'a missing kit still gives a usable colour');
});

test('shirt numbers are stable per player and inside the printable range', () => {
  const numbers = new Set();
  for (let i = 0; i < 200; i++) {
    const id = `player-${i}`;
    const number = shirtNumberFor(id);
    assert.equal(number, shirtNumberFor(id), 'the same player always gets the same number');
    assert.ok(Number.isInteger(number) && number >= 1 && number <= 23);
    numbers.add(number);
  }
  assert.ok(numbers.size > 15, 'numbers spread across the range');
});

test('lobby poses drive known joints only, stay finite and keep players out of sync', () => {
  const keys = new Set(JOINTS.map((joint) => joint.key));
  assert.equal(keys.size, JOINTS.length, 'joint keys are unique');
  for (const pose of [...IDLE_POSES, ...READY_POSES, 'fistPump']) {
    for (const time of [0, .4, 1.3, 3.7, 9]) {
      const targets = samplePose(pose, time, 1.7);
      for (const [key, value] of Object.entries(targets)) {
        assert.ok(keys.has(key), `${pose} drives unknown joint ${key}`);
        assert.ok(Number.isFinite(value) && Math.abs(value) < 3.2, `${pose}.${key} = ${value}`);
      }
    }
  }
  // An unknown pose still returns something to stand in.
  assert.ok(Object.keys(samplePose('nope', 1, 0)).length > 0);
  for (const pose of [...IDLE_POSES, ...READY_POSES]) {
    const seconds = poseDuration(pose, () => .5);
    assert.ok(seconds >= 2 && seconds <= 14, `${pose} runs ${seconds}s`);
    assert.notEqual(nextPose(false, pose, () => .99), pose, 'the same pose never repeats back to back');
    assert.ok(READY_POSES.includes(nextPose(true, 'relaxed', () => .3)), 'ready players use the ready set');
  }
});
