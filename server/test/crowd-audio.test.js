import { test } from 'node:test';
import assert from 'node:assert/strict';

// The audio module reaches the vendored three.js adapter through assetLoader;
// like scripts/check-modules.js, a stub global is enough since no 3D code runs.
globalThis.THREE ??= {};
const { createAudioManager } = await import('../../src/audio/audioManager.js');
const { createPreferences } = await import('../../src/core/preferences.js');

function memoryStorage() {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) };
}

// Minimal Web Audio / HTMLAudioElement doubles: enough to observe which media
// elements play and which gain node each element feeds.
function audioFixture(t) {
  const elements = [], gains = [];
  class FakeAudio {
    constructor(src) { Object.assign(this, { src, loop: false, paused: true, currentTime: 0, plays: 0 }); elements.push(this); }
    play() { this.plays++; this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  const context = {
    state: 'running', currentTime: 0, sampleRate: 8000, destination: {},
    createGain() {
      const node = { sources: [], gain: { value: 1, setTargetAtTime(value) { this.value = value; } }, connect() {} };
      gains.push(node); return node;
    },
    createMediaElementSource(element) { return { connect(node) { node.sources.push(element); } }; },
    createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; },
    createBufferSource() { return { connect() {}, start() {} }; },
    resume: async () => {}, close() {},
  };
  t.mock.method(globalThis, 'fetch', () => Promise.reject(new Error('offline')));
  const previousAudio = globalThis.Audio;
  globalThis.Audio = FakeAudio;
  t.after(() => { globalThis.Audio = previousAudio; });
  const preferences = createPreferences(memoryStorage());
  const audio = createAudioManager({ events: { on: () => () => {} }, preferences, audioContextFactory: () => context });
  const crowdElements = () => elements.filter((element) => element.src.includes('taraftar.mp3'));
  const crowdGain = () => gains.find((node) => node.sources.some((element) => element.src.includes('taraftar.mp3')));
  return { audio, preferences, crowdElements, crowdGain };
}

test('crowd ambience plays only during the match and never duplicates', (t) => {
  const { audio, crowdElements } = audioFixture(t);
  audio.setLobbyActive(true);
  audio.setMatchActive(false);
  assert.ok(crowdElements().every((element) => element.paused), 'no crowd in the lobby');

  audio.setLobbyActive(false);
  for (let frame = 0; frame < 120; frame++) audio.setMatchActive(true);
  assert.equal(crowdElements().length, 1, 'one crowd element for the session');
  const [crowd] = crowdElements();
  assert.equal(crowd.loop, true);
  assert.equal(crowd.paused, false);
  assert.equal(crowd.plays, 1, 'repeated per-frame activation does not restart it');

  audio.setMatchActive(false); // match ended / left / back to lobby
  assert.equal(crowd.paused, true);
  audio.setMatchActive(true); // re-entering a new match
  assert.equal(crowdElements().length, 1);
  assert.equal(crowd.plays, 2);
  audio.dispose(); // page/match screen closed
  assert.equal(crowd.paused, true);
});

test('crowd volume defaults low, applies immediately and 0 mutes', (t) => {
  const { audio, preferences, crowdGain } = audioFixture(t);
  assert.equal(preferences.get().crowdVolume, .2);
  audio.setMatchActive(true);
  assert.equal(crowdGain().gain.value, .2);
  preferences.set({ crowdVolume: .65 });
  assert.equal(crowdGain().gain.value, .65);
  preferences.set({ crowdVolume: 0 });
  assert.equal(crowdGain().gain.value, 0);
});

test('crowd volume preference persists locally and is clamped', () => {
  const storage = memoryStorage();
  createPreferences(storage).set({ crowdVolume: .35 });
  assert.equal(createPreferences(storage).get().crowdVolume, .35);
  const clamped = createPreferences(storage);
  clamped.set({ crowdVolume: 7 });
  assert.equal(clamped.get().crowdVolume, 1);
  clamped.set({ crowdVolume: 'loud' });
  assert.equal(createPreferences(storage).get().crowdVolume, .2);
});
