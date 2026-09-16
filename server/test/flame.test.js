import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFlameState, flameIntensity, FLAME_MIN_CHARGE, FLAME_MIN_SPEED, FLAME_MAX_MS, FLAME_ARM_MS } from '../../src/gameplay/flameState.js';

const fast = { x: 0, y: 3, z: -40 };

test('only rocket shots above 80 % ignite, and intensity rises with charge', () => {
  assert.equal(flameIntensity(FLAME_MIN_CHARGE - .01), 0);
  assert.ok(flameIntensity(FLAME_MIN_CHARGE) > 0);
  assert.ok(flameIntensity(.9) > flameIntensity(.82));
  assert.equal(flameIntensity(1), 1, 'strongest flame at 100 %');
  const flame = createFlameState();
  flame.ignite(.5, 0);
  assert.equal(flame.update({ now: 10, velocity: fast, playing: true }), 0);
});

test('the flame follows a fast ball and goes out when it slows, hits something or play stops', () => {
  const burning = () => { const flame = createFlameState(); flame.ignite(1, 0); flame.update({ now: 20, velocity: fast, playing: true }); return flame; };

  const slowing = burning();
  assert.ok(slowing.update({ now: 100, velocity: { x: 0, y: 2, z: -30 }, playing: true }) > 0, 'still burning while fast');
  assert.equal(slowing.update({ now: 900, velocity: { x: 0, y: 0, z: -(FLAME_MIN_SPEED - 1) }, playing: true }), 0, 'out once slow');

  const hitPost = burning();
  assert.equal(hitPost.update({ now: 80, velocity: { x: 0, y: -2, z: 25 }, playing: true }), 0, 'a rebound puts it out');

  const saved = burning();
  assert.equal(saved.update({ now: 80, velocity: { x: 2, y: 1, z: -8 }, playing: true }), 0, 'a sudden stop puts it out');

  const goal = burning();
  assert.equal(goal.update({ now: 80, velocity: fast, playing: false }), 0, 'goal, out of play or reset put it out');

  const expired = burning();
  assert.equal(expired.update({ now: FLAME_MAX_MS + 1, velocity: fast, playing: true }), 0, 'never outlives its maximum');

  const neverLaunched = createFlameState();
  neverLaunched.ignite(1, 0);
  assert.ok(neverLaunched.update({ now: 50, velocity: { x: 0, y: 0, z: 0 }, playing: true }) > 0, 'waits for the kick to arrive');
  assert.equal(neverLaunched.update({ now: FLAME_ARM_MS + 1, velocity: { x: 0, y: 0, z: 0 }, playing: true }), 0);
});

test('the flame fades as air drag slows the ball but stays visible while it is a rocket', () => {
  const flame = createFlameState();
  flame.ignite(1, 0);
  const launch = flame.update({ now: 0, velocity: { x: 0, y: 0, z: -44 }, playing: true });
  const later = flame.update({ now: 500, velocity: { x: 0, y: 0, z: -34 }, playing: true });
  assert.equal(launch, 1);
  assert.ok(later < launch && later > .5);
});
