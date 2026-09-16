import { assetUrl } from '../engine/assetLoader.js';

const LOBBY_MUSIC_URL = assetUrl('audio/lobby-music.mp3');
const GOAL_SFX_URL = assetUrl('audio/goal.mp3');
const WHISTLE_SFX_URL = assetUrl('audio/whistle.mp3');
const CROWD_AMBIENCE_URL = assetUrl('audio/taraftar.mp3');

// Short procedural SFX built from raw waveform math so no extra audio assets are needed.
function makeBuffer(context, duration, fill) {
  const length = Math.max(1, Math.round(context.sampleRate * duration));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = fill(i / context.sampleRate, i / length);
  return buffer;
}
function buildSfxBuffers(context) {
  const sine = (f, t) => Math.sin(2 * Math.PI * f * t);
  return {
    click: makeBuffer(context, .07, (t) => sine(1100, t) * Math.exp(-t * 60) * .4),
    confirm: makeBuffer(context, .32, (t) => {
      const f = t < .14 ? 660 : 990;
      const local = t < .14 ? t : t - .14;
      return sine(f, t) * Math.exp(-local * 10) * .5;
    }),
    applause: makeBuffer(context, 1.1, (t, ratio) => {
      const swell = Math.sin(Math.PI * ratio);
      const noise = Math.random() * 2 - 1;
      const horn = sine(150, t) * .3;
      return (noise * .6 + horn) * swell * .5;
    }),
  };
}
// Decoded once and cached; avoids <audio> element seek/autoplay quirks for a one-shot clip.
function loadSfxBuffer(context, url) {
  return fetch(url).then((response) => response.arrayBuffer()).then((data) => context.decodeAudioData(data));
}

export function createAudioManager({ events, preferences, audioContextFactory = () => new AudioContext() }) {
  const subscriptions = new Set();
  let context = null, master = null, music = null, sfx = null, element = null, sfxBuffers = null, playing = false, lobbyActive = false;
  // Stadium crowd loop: its own gain under master and one element for the whole session.
  let crowd = null, crowdElement = null, crowdPlaying = false, matchActive = false;

  function ensureContext() {
    if (context) return context;
    context = audioContextFactory();
    master = context.createGain(); music = context.createGain(); sfx = context.createGain();
    master.connect(context.destination); music.connect(master); sfx.connect(master);
    element = new Audio(LOBBY_MUSIC_URL);
    element.loop = true; element.preload = 'auto';
    context.createMediaElementSource(element).connect(music);
    crowd = context.createGain(); crowd.connect(master);
    crowdElement = new Audio(CROWD_AMBIENCE_URL);
    crowdElement.loop = true; crowdElement.preload = 'auto';
    context.createMediaElementSource(crowdElement).connect(crowd);
    sfxBuffers = buildSfxBuffers(context);
    loadSfxBuffer(context, GOAL_SFX_URL).then((buffer) => { sfxBuffers.goal = buffer; }).catch(() => {});
    loadSfxBuffer(context, WHISTLE_SFX_URL).then((buffer) => { sfxBuffers.whistle = buffer; }).catch(() => {});
    applyPreferences(preferences.get());
    return context;
  }
  function applyPreferences(value) {
    if (!context) return;
    const now = context.currentTime;
    master.gain.setTargetAtTime(value.masterVolume, now, .04);
    music.gain.setTargetAtTime(value.lobbyMusicEnabled ? value.lobbyMusicVolume : 0, now, .04);
    sfx.gain.setTargetAtTime(value.lobbyMusicVolume, now, .04);
    crowd.gain.setTargetAtTime(value.crowdVolume, now, .04);
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
  function startCrowd() {
    if (crowdPlaying || !matchActive || !context || context.state !== 'running') return;
    crowdPlaying = true;
    crowdElement.currentTime = 0;
    crowdElement.play().catch(() => { crowdPlaying = false; });
  }
  function stopCrowd() { if (!crowdPlaying) return; crowdPlaying = false; crowdElement.pause(); }
  function playSfx(type) {
    let audioContext;
    try { audioContext = ensureContext(); } catch { return; }
    const cue = type === 'kickoff' ? 'whistle' : type;
    const buffer = sfxBuffers?.[cue];
    if (!buffer) return;
    const play = () => {
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(sfx);
      source.start();
    };
    if (audioContext.state !== 'running') audioContext.resume().then(play).catch(() => {});
    else play();
  }
  async function unlock() {
    const audio = ensureContext();
    if (audio.state !== 'running') await audio.resume();
    if (lobbyActive) startLobbyTheme();
    if (matchActive) startCrowd();
  }
  // True only while the match pitch is on screen (playing, goal celebration, kickoff).
  function setMatchActive(value) {
    matchActive = !!value;
    if (!matchActive) { stopCrowd(); return; }
    try { ensureContext(); } catch { return; }
    startCrowd();
  }
  function setLobbyActive(value) { lobbyActive = !!value; if (!lobbyActive) stopLobbyTheme(); else if (context?.state === 'running') startLobbyTheme(); }
  function registerCue(event, callback) { const unsubscribe = events.on(event, callback); subscriptions.add(unsubscribe); return () => { unsubscribe(); subscriptions.delete(unsubscribe); }; }
  const unsubscribePreferences = preferences.subscribe(applyPreferences);
  function dispose() { stopLobbyTheme(); matchActive = false; stopCrowd(); unsubscribePreferences(); for (const unsubscribe of subscriptions) unsubscribe(); subscriptions.clear(); context?.close(); }
  return { unlock, setLobbyActive, setMatchActive, registerCue, playSfx, dispose };
}
