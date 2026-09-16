const STORAGE_KEY = 'officeFutbollPreferences';

export const DEFAULT_KEYS = Object.freeze({
  moveUp: 'ArrowUp', moveDown: 'ArrowDown', moveLeft: 'ArrowLeft', moveRight: 'ArrowRight',
  sprint: 'KeyW', pass: 'KeyA', shoot: 'KeyS', cross: 'KeyD', menu: 'Escape',
});

// crowdVolume: in-match stadium ambience, separate from music and effects; subtle by default.
const DEFAULTS = Object.freeze({ masterVolume: 0.5, lobbyMusicVolume: 0.5, lobbyMusicEnabled: true, crowdVolume: 0.2, keys: DEFAULT_KEYS });

function clampVolume(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
}
function normalize(candidate = {}) {
  const keys = { ...DEFAULT_KEYS };
  for (const name of Object.keys(DEFAULT_KEYS)) if (typeof candidate.keys?.[name] === 'string' && candidate.keys[name]) keys[name] = candidate.keys[name];
  if (new Set(Object.values(keys)).size !== Object.keys(keys).length) Object.assign(keys, DEFAULT_KEYS);
  return { masterVolume: clampVolume(candidate.masterVolume, .5), lobbyMusicVolume: clampVolume(candidate.lobbyMusicVolume, .5), lobbyMusicEnabled: candidate.lobbyMusicEnabled !== false,
    crowdVolume: clampVolume(candidate.crowdVolume, DEFAULTS.crowdVolume), keys };
}

export function createPreferences(storage = globalThis.localStorage) {
  let value = { ...DEFAULTS, keys: { ...DEFAULT_KEYS } };
  const listeners = new Set();
  try { value = normalize(JSON.parse(storage.getItem(STORAGE_KEY) || '{}')); } catch { /* Storage may be unavailable. */ }
  function get() { return { ...value, keys: { ...value.keys } }; }
  function save() {
    try { storage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* The game remains usable without storage. */ }
    for (const listener of listeners) listener(get());
  }
  function set(patch) { value = normalize({ ...value, ...patch, keys: { ...value.keys, ...patch.keys } }); save(); }
  function resetKeys() { value = { ...value, keys: { ...DEFAULT_KEYS } }; save(); }
  function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  return { get, set, resetKeys, subscribe };
}
