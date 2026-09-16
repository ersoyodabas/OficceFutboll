import { CLIENT, SERVER } from '../network/protocol.js';
import { validatePlayerName, PLAYER_NAME_MAX_LENGTH } from '../../shared/playerName.js';
import { savePlayerName } from '../core/playerProfile.js';

export function createProfile({ state, ui, network, events }) {
  const $ = ui.dom.$;
  const dialog = $('profileDialog'), input = $('profileNameInput');
  const status = $('profileStatus'), save = $('profileSaveBtn'), button = $('profileBtn');
  let pending = false;
  input.maxLength = PLAYER_NAME_MAX_LENGTH;
  function resetPending() { pending = false; save.disabled = false; input.readOnly = false; }
  function close() { if (dialog.open) dialog.close(); resetPending(); }
  button.addEventListener('click', () => {
    if (!state.joined || ui.dom.lobbyOverlay.hidden) return;
    input.value = state.myName || ui.dom.nameInput.value;
    status.textContent = ''; input.removeAttribute('aria-invalid'); resetPending();
    dialog.showModal(); input.focus(); input.select();
  });
  $('profileCancelBtn').addEventListener('click', close);
  dialog.addEventListener('close', resetPending);
  $('profileForm').addEventListener('submit', (event) => {
    event.preventDefault();
    if (pending) return;
    const result = validatePlayerName(input.value);
    if (result.error) {
      status.textContent = result.error; input.setAttribute('aria-invalid', 'true'); input.focus(); return;
    }
    if (!network.isOpen()) { status.textContent = 'Bağlantı kesildi. Yeniden bağlanıp tekrar dene.'; return; }
    input.removeAttribute('aria-invalid');
    pending = true; save.disabled = true; input.readOnly = true;
    status.textContent = 'Kaydediliyor…';
    network.send({ type: CLIENT.UPDATE_PROFILE, name: result.name });
  });
  events.on(SERVER.PROFILE_UPDATED, (msg) => {
    if (msg.id !== state.myId) return;
    sync(msg);
    if (pending) close();
  });
  events.on(SERVER.PROFILE_ERROR, (msg) => {
    if (!dialog.open) return;
    resetPending(); status.textContent = msg.message;
    input.setAttribute('aria-invalid', 'true'); input.focus();
  });
  function sync(player) {
    if (state.myName !== player.name) savePlayerName(player.name);
    state.myName = player.name;
    ui.dom.nameInput.value = player.name;
    $('profileName').textContent = player.name;
    $('profileAvatar').textContent = Array.from(player.name)[0]?.toLocaleUpperCase('tr') || 'O';
    if (player.inMatch) close();
  }
  return { sync };
}
