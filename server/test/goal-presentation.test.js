import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGoalSequence } from '../../src/network/goalSequence.js';

function fixture() {
  const calls = [];
  const method = (name) => (...args) => calls.push([name, ...args]);
  const sequence = createGoalSequence({
    presentation: { show: method('show'), hide: method('hide') },
    camera: { beginGoal: method('goalCamera'), beginKickoff: method('kickoffCamera'), resetMode: method('resetCamera') },
    audio: { playSfx: method('audio') }, controls: { clearGameInput: method('clearInput') },
  });
  const goal = { phase: 'goalCelebration', serverTime: 10000,
    goalEvent: { id: 1, startedAt: 10000, endsAt: 14000, position: { x: 0, z: -38 } } };
  return { calls, sequence, goal };
}
test('duplicate events/snapshots do not replay presentation, camera or audio', () => {
  const { calls, sequence, goal } = fixture();
  sequence.sync(goal);
  for (let i = 0; i < 80; i++) sequence.sync(goal);
  assert.equal(calls.filter(([name]) => name === 'show').length, 1);
  assert.equal(calls.filter(([name]) => name === 'goalCamera').length, 1);
  const reset = { ...goal, phase: 'kickoff', kickoffEndsAt: 14800 };
  assert.equal(sequence.sync(reset).snap, true);
  assert.equal(sequence.sync(reset).snap, undefined);
  assert.equal(sequence.sync(goal).ignore, true);
  sequence.sync({ ...reset, phase: 'playing' });
  assert.equal(calls.filter(([name]) => name === 'kickoffCamera').length, 1);
});
test('late snapshot seeks the existing sequence and missing reset recovers from playing snapshot', () => {
  const { calls, sequence, goal } = fixture();
  sequence.sync({ ...goal, serverTime: 12500 });
  assert.equal(calls.find(([name]) => name === 'show')[2], 12500);
  assert.equal(calls.filter(([name]) => name === 'audio').length, 0);
  assert.equal(sequence.sync({ ...goal, phase: 'playing', kickoffEndsAt: 14800 }).snap, true);
  assert.equal(sequence.sync(goal).ignore, true);
  sequence.clear();
  assert.equal(sequence.sync(goal).ignore, true, 'completed match cannot replay a late goal');
  sequence.clear(true);
  sequence.sync(goal);
  assert.equal(calls.filter(([name]) => name === 'show').length, 2);
});
