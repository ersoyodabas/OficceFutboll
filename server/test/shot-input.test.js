import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createControls } from '../../src/gameplay/controls.js';
import { createEvents } from '../../src/core/events.js';
import { createShotPowerBar } from '../../src/ui/shotPowerBar.js';
import { SHOT_MAX_CHARGE_MS } from '../../shared/shot.js';
import { CLIENT, SERVER } from '../../src/network/protocol.js';

function fixture(t) {
  let now = 100, hasBall = true;
  t.mock.method(performance, 'now', () => now);
  const listeners = new Map(), sent = [], events = createEvents();
  const previousWindow = globalThis.window, previousElement = globalThis.HTMLElement;
  globalThis.window = { addEventListener: (name, fn) => listeners.set(name, fn) };
  globalThis.HTMLElement = class {};
  t.after(() => { globalThis.window = previousWindow; globalThis.HTMLElement = previousElement; });
  const segments = Array.from({ length: 10 }, () => ({ style: { setProperty() {} } }));
  const shotBar = createShotPowerBar({ hidden: true, style: {}, querySelectorAll: () => segments, classList: { toggle() {} } });
  const controls = createControls({
    state: { myId: 'me', phase: 'playing', joined: true },
    ui: { dom: { matchMenu: { hidden: true } } },
    network: { isOpen: () => true, send: (message) => sent.push(message) },
    preferences: { get: () => ({ keys: { shoot: 'KeyS', pass: 'KeyA', cross: 'KeyD' } }) },
    settings: { handleKeydown: () => false, isOpen: () => false },
    players: { hasBall: () => hasBall }, shotBar, events,
  });
  return {
    shotBar, controls, sent,
    at: (time) => { now = time; },
    possession: (value) => { hasBall = value; },
    key: (type, repeat = false) => listeners.get(type)({ code: 'KeyS', repeat, preventDefault() {} }),
    result: (action, fields = {}) => events.emit(SERVER.ACTION_RESULT, { id: 'me', action, ...fields }),
  };
}

test('keydown starts the bar immediately; delayed acknowledgements and repeats cannot extend two seconds', (t) => {
  const f = fixture(t);
  f.key('keydown');
  assert.equal(f.shotBar.startedAt(), 100, 'bar starts before the server replies');
  assert.equal(f.shotBar.level(100), 0);
  f.at(600);
  assert.equal(f.shotBar.level(600), .25);
  f.result('shot_charge', { startedAt: 9_000_000 });
  f.key('keydown', true);
  assert.equal(f.shotBar.startedAt(), 100);
  assert.equal(f.shotBar.level(100 + SHOT_MAX_CHARGE_MS - 1), .9995);
  assert.equal(f.shotBar.level(100 + SHOT_MAX_CHARGE_MS), 1);
  assert.deepEqual(f.sent, [{ type: CLIENT.SHOT_CHARGE_START }]);
  f.result('shot', { charge: 1 });
  f.key('keydown', true);
  f.key('keyup');
  assert.deepEqual(f.sent.at(-1), { type: CLIENT.SHOT_RELEASE });
  assert.equal(f.shotBar.isCharging(), false);
});

test('early keyup sends release immediately, including before acknowledgement', (t) => {
  const f = fixture(t);
  f.key('keydown');
  f.at(350);
  assert.equal(f.shotBar.level(350), .125);
  f.key('keyup');
  assert.deepEqual(f.sent, [{ type: CLIENT.SHOT_CHARGE_START }, { type: CLIENT.SHOT_RELEASE }]);
  f.result('shot_charge', { startedAt: 12345 });
  assert.equal(f.shotBar.isCharging(), false, 'a late acknowledgement cannot resurrect a released charge');
});

test('tackles, rejected charges and cleared input do not leave a predicted bar active', (t) => {
  const f = fixture(t);
  f.possession(false);
  f.key('keydown');
  assert.equal(f.shotBar.isCharging(), false);
  f.result('standing_tackle');
  f.key('keyup');
  f.possession(true);
  f.key('keydown');
  f.result('shot_cancel');
  assert.equal(f.shotBar.isCharging(), false);
  f.controls.clearGameInput();
  f.key('keydown', true);
  assert.equal(f.shotBar.isCharging(), false);
});
