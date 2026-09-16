const BINDINGS = [
  ['moveUp', 'Yukarı hareket'], ['moveDown', 'Aşağı hareket'], ['moveLeft', 'Sol hareket'], ['moveRight', 'Sağ hareket'],
  ['sprint', 'Sprint'], ['pass', 'Pas / top kapma'], ['shoot', 'Şut / ayakta müdahale'], ['cross', 'Orta / kayarak müdahale'], ['menu', 'Menü'],
];

export function keyLabel(code) {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'ESC', Space: 'BOŞLUK' }[code] || code;
}

export function createSettings({ preferences, onInteraction = () => {} }) {
  const $ = (id) => document.getElementById(id);
  const overlay = $('settingsOverlay'), masterVolume = $('masterVolume'), masterVolumeValue = $('masterVolumeValue');
  const lobbyMusicVolume = $('lobbyMusicVolume'), lobbyMusicVolumeValue = $('lobbyMusicVolumeValue');
  const lobbyMusicEnabled = $('lobbyMusicEnabled'), bindings = $('keyBindings'), captureStatus = $('keyCaptureStatus');
  const crowdVolume = $('crowdVolume'), crowdVolumeValue = $('crowdVolumeValue');
  let capturing = null;
  function render(value = preferences.get()) {
    masterVolume.value = String(value.masterVolume); masterVolumeValue.textContent = `${Math.round(value.masterVolume * 100)}%`;
    lobbyMusicVolume.value = String(value.lobbyMusicVolume); lobbyMusicVolumeValue.textContent = `${Math.round(value.lobbyMusicVolume * 100)}%`;
    lobbyMusicEnabled.checked = value.lobbyMusicEnabled;
    crowdVolume.value = String(value.crowdVolume); crowdVolumeValue.textContent = `${Math.round(value.crowdVolume * 100)}%`;
    bindings.replaceChildren(...BINDINGS.map(([name, label]) => {
      const row = document.createElement('div'); row.className = 'key-binding-row';
      const title = document.createElement('span'); title.textContent = label;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary key-binding-button'; button.dataset.binding = name;
      button.textContent = capturing === name ? 'Tuşa bas…' : keyLabel(value.keys[name]);
      button.addEventListener('click', () => { onInteraction(); capturing = name; captureStatus.textContent = `${label} için yeni tuşa bas.`; render(); });
      row.append(title, button); return row;
    }));
  }
  function open() { onInteraction(); overlay.hidden = false; render(); $('settingsCloseBtn').focus({ preventScroll: true }); }
  function close() { capturing = null; captureStatus.textContent = ''; overlay.hidden = true; }
  function isOpen() { return !overlay.hidden; }
  function handleKeydown(event) {
    if (!isOpen()) return false;
    if (!capturing) { if (event.code === 'Escape') { event.preventDefault(); close(); } return true; }
    event.preventDefault();
    if (event.code === 'Escape') { capturing = null; captureStatus.textContent = 'Tuş ataması iptal edildi.'; render(); return true; }
    if (Object.entries(preferences.get().keys).some(([name, code]) => name !== capturing && code === event.code)) { captureStatus.textContent = `${keyLabel(event.code)} başka bir komuta atanmış.`; return true; }
    preferences.set({ keys: { [capturing]: event.code } }); captureStatus.textContent = 'Tuş ataması kaydedildi.'; capturing = null; render(); return true;
  }
  document.querySelectorAll('[data-open-settings]').forEach((button) => button.addEventListener('click', open));
  $('settingsCloseBtn').addEventListener('click', close);
  $('resetKeysBtn').addEventListener('click', () => { onInteraction(); preferences.resetKeys(); captureStatus.textContent = 'Varsayılan tuşlar geri yüklendi.'; });
  masterVolume.addEventListener('input', () => { onInteraction(); preferences.set({ masterVolume: Number(masterVolume.value) }); });
  lobbyMusicVolume.addEventListener('input', () => { onInteraction(); preferences.set({ lobbyMusicVolume: Number(lobbyMusicVolume.value) }); });
  lobbyMusicEnabled.addEventListener('change', () => { onInteraction(); preferences.set({ lobbyMusicEnabled: lobbyMusicEnabled.checked }); });
  crowdVolume.addEventListener('input', () => { onInteraction(); preferences.set({ crowdVolume: Number(crowdVolume.value) }); });
  preferences.subscribe(render); render();
  return { open, close, isOpen, handleKeydown };
}
