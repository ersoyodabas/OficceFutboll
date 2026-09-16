// Original ceremonial stadium cue built with Web Audio. It intentionally does
// not reproduce any third-party anthem or recording, and requires no remote asset.
export function createAudioManager({ events, preferences, audioContextFactory = () => new AudioContext() }) {
  const subscriptions = new Set();
  let context = null, master = null, music = null, playing = false, lobbyActive = false, loopTimer = null;

  function ensureContext() {
    if (context) return context;
    context = audioContextFactory();
    master = context.createGain(); music = context.createGain();
    master.connect(context.destination); music.connect(master);
    applyPreferences(preferences.get());
    return context;
  }
  function applyPreferences(value) {
    if (!context) return;
    const now = context.currentTime;
    master.gain.setTargetAtTime(value.masterVolume, now, .04);
    music.gain.setTargetAtTime(value.lobbyMusicEnabled ? value.lobbyMusicVolume * .24 : 0, now, .04);
    if (!value.lobbyMusicEnabled) stopLobbyTheme();
    else if (lobbyActive && context.state === 'running') startLobbyTheme();
  }
  function playTone(frequency, start, duration, type = 'sine', gain = .15) {
    const oscillator = context.createOscillator(), envelope = context.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, start);
    envelope.gain.setValueAtTime(.0001, start); envelope.gain.exponentialRampToValueAtTime(gain, start + .05); envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(envelope).connect(music); oscillator.start(start); oscillator.stop(start + duration + .03);
  }
  function schedulePhrase(start) {
    // Original minor-mode fanfare: sustained harmony, a soft bell and pulse.
    const chords = [[174.61, 220, 261.63], [196, 233.08, 293.66], [146.83, 174.61, 220], [164.81, 196, 246.94]];
    chords.forEach((notes, index) => {
      const at = start + index * 1.5;
      notes.forEach((frequency) => playTone(frequency, at, 1.32, 'triangle', .12));
      playTone(notes[2] * 2, at + .12, .32, 'sine', .065);
      playTone(notes[0] / 2, at, .7, 'sine', .1); playTone(notes[0] / 2, at + .75, .45, 'sine', .07);
    });
  }
  function startLobbyTheme() {
    if (playing || !lobbyActive || !preferences.get().lobbyMusicEnabled || !context || context.state !== 'running') return;
    playing = true;
    const schedule = () => { if (!playing) return; schedulePhrase(context.currentTime + .06); loopTimer = setTimeout(schedule, 6000); };
    schedule();
  }
  function stopLobbyTheme() { playing = false; clearTimeout(loopTimer); loopTimer = null; }
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
