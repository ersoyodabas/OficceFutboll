import { CLIENT } from '../network/protocol.js';
import { FIELD } from '../../shared/field.js';
import { LobbyView } from './lobbyView.js';
import { normalizeServerUrl } from '../network/urls.js';
export function createLobby({ state, ui, network, grassMat, createPitchMarkings, createFootballer }) {
let lobbyView = null;
let joinInProgress = false;
function renderLobby(msg) {
  ui.dom.scoreBlueEl.textContent = msg.score.blue;
  ui.dom.scoreRedEl.textContent = msg.score.red;
  const players = msg.players.filter((p) => !p.isAI);
  const me = players.find((p) => p.id === state.myId);
  if (me) {
    state.myTeam = me.team;
    state.myPosition = me.position;
    state.mySlot = me.slot;
    state.myReady = !!me.ready;
    ui.dom.$('profileName').textContent = me.name;
    ui.dom.$('profileAvatar').textContent = Array.from(me.name)[0].toLocaleUpperCase('tr');
    ui.dom.$('profileRole').textContent = Number.isInteger(state.mySlot)
      ? `${state.myTeam === 'blue' ? 'Mavi takım' : 'Kırmızı takım'}${me.isHost ? ' • Lobi yöneticisi' : ''}`
      : 'Sahada bir yer seç';
  }
  const inCountdown = msg.phase === 'countdown';
  const matchInProgress = msg.phase === 'playing' || msg.phase === 'ended';
  const readyCount = players.filter((p) => p.ready).length;
  const selected = Number.isInteger(state.mySlot);
  ui.dom.$('lobbyPlayerCount').textContent = `${players.length} oyuncu`;
  for (const team of ['blue', 'red']) {
    ui.dom.$(team + 'RosterCount').textContent = `${players.filter((p) => p.team === team && Number.isInteger(p.slot)).length} / 5`;
  }
  if (!lobbyView) {
    lobbyView = new LobbyView({
      container: ui.dom.$('lobbyPitch'), slotsElement: ui.dom.$('pitchSlots'), field: FIELD,
      grassMaterial: grassMat, drawMarkings: createPitchMarkings,
      createFootballer: (team, number, target) => createFootballer(team, number, '', false, target),
      onSelect: (team, slot) => {
        if (!network.isOpen()) return;
        ui.dom.slotStatus.textContent = '';
        network.send({ type: CLIENT.SELECT_SLOT, team, slot });
      },
    });
  }
  lobbyView.update(players, state.myId, inCountdown || !!me?.inMatch);
  ui.dom.slotStatus.textContent = '';
  ui.dom.readyBtn.disabled = !selected || inCountdown || matchInProgress;
  ui.dom.readyBtn.textContent = matchInProgress ? 'MAÇ BEKLENİYOR' : state.myReady ? '✔ HAZIR • İPTAL ET' : 'HAZIRIM';
  ui.dom.readyBtn.classList.toggle('isReady', state.myReady);
  ui.dom.$('readyMeterFill').style.width = `${players.length ? readyCount / players.length * 100 : 0}%`;
  if (matchInProgress) {
    ui.dom.lobbyStatus.textContent = 'Devam eden maç bitince yeni maça katılabilirsin.';
  } else if (inCountdown) {
    ui.dom.lobbyStatus.textContent = 'Herkes hazır! Maç başlıyor…';
  } else {
    ui.dom.lobbyStatus.textContent = selected ? 'Yerini aldın. Hazırsan sahaya çıkalım.' : 'Takımına katılmak için sahada boş bir yere tıkla.';
  }
  ui.dom.readyProgress.textContent = `${readyCount} / ${players.length} oyuncu hazır`;
}
ui.dom.connectBtn.addEventListener('click', joinLobby);
[ui.dom.serverInput, ui.dom.nameInput].forEach((el) => el.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinLobby();
}));
async function joinLobby() {
  if (joinInProgress || state.joined) return;
  console.log('[JOIN] Join button clicked');
  const name = ui.dom.nameInput.value.trim();
  const serverUrl = normalizeServerUrl(ui.dom.serverInput.value);
  console.log('[JOIN] Invite state:', state.autoJoinRequested);
  console.log('[JOIN] Lobby:', 'existing server lobby');
  console.log('[JOIN] Server:', serverUrl);
  console.log('[JOIN] Player:', name);
  if (!name) {
    const error = 'Katılmadan önce adını yaz.';
    ui.dom.connStatus.textContent = error;
    return;
  }
  joinInProgress = true;
  ui.dom.connectBtn.disabled = true;
  ui.dom.connectBtn.textContent = 'Katılıyor…';
  if (state.autoJoinRequested) ui.updateConnectionStatus('connecting');
  try {
    await network.ensureConnected();
    if (!network.isOpen()) throw new Error('Sunucuya bağlanılamadı.');
    state.myTeam = null;
    state.mySlot = null;
    const accepted = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Lobiye katılım zaman aşımına uğradı.')), 10000);
      state.pendingJoin = {
        resolve: () => { clearTimeout(timeout); resolve(); },
        reject: (error) => { clearTimeout(timeout); reject(error); },
      };
    });
    console.log('[JOIN] Sending join request');
    network.send({ type: CLIENT.JOIN, name });
    await accepted;
  } catch (error) {
    if (state.pendingJoin) state.pendingJoin = null;
    state.joined = false;
    state.myId = null;
    network.dispose();
    const status = ui.dom.connStatus;
    status.textContent = error.message || 'Lobiye katılım başarısız oldu.';
    status.classList.add('error');
    ui.showOverlay(ui.dom.connectOverlay);
    state.autoJoinRequested = false;
  } finally {
    joinInProgress = false;
    ui.dom.connectBtn.disabled = false;
    ui.dom.connectBtn.textContent = 'Lobiye Katıl';
  }
}
ui.dom.readyBtn.addEventListener('click', () => {
  if (ui.dom.readyBtn.disabled) return; // countdown already running
  network.send({ type: CLIENT.READY, ready: !state.myReady });
});

function start() { if (state.autoJoinRequested) joinLobby(); }
function render(now) { if (lobbyView) lobbyView.render(now); }

return { renderLobby, render, start };
}
