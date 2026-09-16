import { assetUrl } from '../engine/assetLoader.js';

const LOBBY_MUSIC_URL = assetUrl('audio/lobby-music.mp3');

export function createAudioManager({ events, preferences, audioContextFactory = () => new AudioContext() }) {
  const subscriptions = new Set();
  let context = null, master = null, music = null, element = null, playing = false, lobbyActive = false;

  function ensureContext() {
    if (context) return context;
    context = audioContextFactory();
    master = context.createGain(); music = context.createGain();
    master.connect(context.destination); music.connect(master);
    element = new Audio(LOBBY_MUSIC_URL);
    element.loop = true; element.preload = 'auto';
    context.createMediaElementSource(element).connect(music);
    applyPreferences(preferences.get());
    return context;
  }
  function applyPreferences(value) {
    if (!context) return;
    const now = context.currentTime;
    master.gain.setTargetAtTime(value.masterVolume, now, .04);
    music.gain.setTargetAtTime(value.lobbyMusicEnabled ? value.lobbyMusicVolume : 0, now, .04);
    if (!value.lobbyMusicEnabled) stopLobbyTheme();
    else if (lobbyActive && context.state === 'running') startLobbyTheme();
  }
  function startLobbyTheme() {
    if (playing || !lobbyActive || !preferences.get().lobbyMusicEnabled || !context || context.state !== 'running') return;
    playing = true;
    element.currentTime = 0;
    element.play().catch(() => { playing = false; });
  }
  function stopLobbyTheme() { if (!playing) return; playing = false; element.pause(); }
  async function unlock() {
    const audio = ensureContext();
    if (audio.state !== 'running') await audio.resume();
    if (lobbyActive) startLobbyTheme();
  }
  function setLobbyActive(value) { lobbyActive = !!value; if (!lobbyActive) stopLobbyTheme(); else if (context?.state === 'running') startLobbyTheme(); }
  function registerCue(event, callback) { const unsubscribe = events.on(event, callback); subscriptions.add(unsubscribe); return () => { unsubscribe(); subscriptions.delete(unsubscribe); }; }
  const unsubscribePreferences = preferences.subscribe(applyPreferences);
  function dispose() { stopLobbyTheme(); unsubscribePreferences(); for (const unsubscribe of subscriptions) unsubscribe(); subscriptions.clear(); context?.close(); }
  return { unlock, setLobbyActive, registerCue, dispose };
}
