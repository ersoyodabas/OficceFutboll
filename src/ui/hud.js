import { clubIdentity, getClub } from '../../shared/clubs.js';
import { formatClock } from './matchTimer.js';
import { createClubBadge } from './clubBadge.js';
import { createCountdown } from './countdown.js';
import { keyLabel } from './settings.js';
import { createGoalPresentation } from './goalPresentation.js';
import { createOutNotice } from './outNotice.js';
import { isMatchPhase } from '../../shared/matchPhases.js';
export function createUI({ state, canvas, onClearInput, onLeaveMatch, preferences }) {
const goalPresentation = createGoalPresentation();
const outNotice = createOutNotice();
const $ = (id) => document.getElementById(id);

const hud = $('hud');
const hint = $('hint');
const scoreBlueEl = $('scoreBlue');
const scoreRedEl = $('scoreRed');
const myFlagBlue = $('myFlagBlue');
const myFlagRed = $('myFlagRed');
const matchClockEl = $('matchClock');
const posLabelEl = $('posLabel');
const crests = { blue: createClubBadge($('crestBlue')), red: createClubBadge($('crestRed')) };

const connectOverlay = $('connectOverlay');
const lobbyOverlay = $('lobbyOverlay');
const endOverlay = $('endOverlay');
const disconnectOverlay = $('disconnectOverlay');
const matchMenu = $('matchMenu');
const settingsOverlay = $('settingsOverlay');
const resumeBtn = $('resumeBtn');
const leaveMatchBtn = $('leaveMatchBtn');

const serverInput = $('serverInput');
const nameInput = $('nameInput');
const connectBtn = $('connectBtn');
const connStatus = $('connStatus');

const lobbyStatus = $('lobbyStatus');
const slotStatus = $('slotStatus');
const readyBtn = $('readyBtn');
const readyProgress = $('readyProgress');

const endResultEl = $('endResult');
const endScoreEl = $('endScore');
const disconnectMsg = $('disconnectMsg');
const reconnectBtn = $('reconnectBtn');

const lobbyMusicQuickVolume = $('lobbyMusicQuickVolume');
const lobbyLogo = $('lobbyLogo');
const chatPanel = $('chatPanel');
const chatToggleBtn = $('chatToggleBtn');
const chatMessages = $('chatMessages');
const chatForm = $('chatForm');
const chatInput = $('chatInput');

const countdownOverlay = $('countdownOverlay');
const countdownNumber = $('countdownNumber');
const countdownSub = $('countdownSub');
const { showCountdownOverlay, hideCountdownOverlay } = createCountdown({ countdownOverlay, countdownNumber, countdownSub });
function showOverlay(el) {
  if (el !== lobbyOverlay) for (const id of ['profileDialog', 'clubDialog']) { const dialog = $(id); if (dialog.open) dialog.close(); }
  if (el) { goalPresentation.hide(); outNotice.hide(); }
  setMatchMenu(false);
  settingsOverlay.hidden = true;
  [connectOverlay, lobbyOverlay, endOverlay, disconnectOverlay].forEach((o) => { o.hidden = (o !== el); });
}
function updateConnectionStatus(state) {
  connStatus.classList.remove('error', 'success');
  switch (state) {
    case 'connecting':
      connStatus.textContent = 'Bağlanıyor…';
      break;
    case 'connected':
      connStatus.textContent = 'Bağlandı';
      connStatus.classList.add('success');
      break;
    case 'failed':
      connStatus.textContent = 'Sunucuya bağlanılamadı.';
      connStatus.classList.add('error');
      break;
    case 'disconnected':
      connStatus.textContent = 'Bağlantı kesildi.';
      connStatus.classList.add('error');
      break;
    default:
      connStatus.textContent = '';
  }
}
function setMatchMenu(open) {
  if (open && (!isMatchPhase(state.phase) || state.waitingInLobby || !state.joined)) return;
  const wasOpen = !matchMenu.hidden;
  matchMenu.hidden = !open;
  hud.inert = open;
  canvas.inert = open;
  if (open || wasOpen) onClearInput();
  if (open) {
    $('menuScore').textContent = `${scoreBlueEl.textContent} : ${scoreRedEl.textContent}`;
    resumeBtn.focus({ preventScroll: true });
  } else if (wasOpen) {
    canvas.focus({ preventScroll: true });
  }
}
leaveMatchBtn.addEventListener('click', () => {
  onClearInput();
    onLeaveMatch();
});

function applyStateHUD(msg) {
  for (const team of ['blue', 'red']) {
    const identity = clubIdentity(msg.teams?.[team] || state.teams?.[team]);
    if (!identity) continue;
    const suffix = team === 'blue' ? 'Blue' : 'Red';
    $('scoreName' + suffix).textContent = identity.initials;
    $('menuName' + suffix).textContent = identity.name;
    $('scoreName' + suffix).parentElement.title = identity.name;
    crests[team](getClub(identity.clubId));
  }
  scoreBlueEl.textContent = msg.score.blue;
  scoreRedEl.textContent = msg.score.red;
  if (!matchMenu.hidden) $('menuScore').textContent = `${msg.score.blue} : ${msg.score.red}`;
  myFlagBlue.hidden = state.myTeam !== 'blue';
  myFlagRed.hidden = state.myTeam !== 'red';
  if (state.positionsData && state.positionsData[state.myPosition]) {
    posLabelEl.textContent = `Mevkin: ${state.myPosition} — ${state.positionsData[state.myPosition].label}`;
  }


}
// Counts down to the server's match end; the server ends the match with the current score at 00:00.
function updateClock() {
  if (!(state.serverMatchEndsAt > 0)) return;
  const remaining = state.serverMatchEndsAt - (Date.now() + state.serverClockOffset);
  matchClockEl.textContent = formatClock(Math.ceil(Math.max(0, remaining) / 1000) * 1000);
  matchClockEl.classList.toggle('low', remaining <= 30000);
}
function updateControlHint(value = preferences.get()) {
  hint.replaceChildren();
  const fragment = document.createDocumentFragment();
  const addKey = (code) => { const key = document.createElement('kbd'); key.textContent = keyLabel(code); fragment.append(key); };
  addKey(value.keys.moveLeft); addKey(value.keys.moveUp); addKey(value.keys.moveDown); addKey(value.keys.moveRight);
  fragment.append(' hareket · '); addKey(value.keys.sprint); fragment.append(' sprint · '); addKey(value.keys.pass); fragment.append(' pas · '); addKey(value.keys.shoot); fragment.append(' şut / ayakta müdahale · '); addKey(value.keys.cross); fragment.append(' orta / kayarak müdahale');
  hint.append(fragment);
  $('menuBtn').textContent = `${keyLabel(value.keys.menu)} · Menü`;
}
preferences.subscribe(updateControlHint); updateControlHint();
function syncLobbyMusicQuickVolume(value = preferences.get()) { lobbyMusicQuickVolume.value = String(value.lobbyMusicVolume); }
preferences.subscribe(syncLobbyMusicQuickVolume); syncLobbyMusicQuickVolume();
lobbyMusicQuickVolume.addEventListener('input', () => preferences.set({ lobbyMusicVolume: Number(lobbyMusicQuickVolume.value) }));
$('menuBtn').addEventListener('click', () => setMatchMenu(true));
resumeBtn.addEventListener('click', () => setMatchMenu(false));
reconnectBtn.addEventListener('click', () => { showOverlay(connectOverlay); updateConnectionStatus('idle'); });

function showMatchEnd(msg) {
    const won = msg.winner === state.myTeam;
    const draw = msg.score.blue === msg.score.red;
    endResultEl.textContent = draw ? 'BERABERE' : (won ? 'TAKIMIN KAZANDI! 🏆' : 'TAKIMIN KAYBETTİ 😅');
    endResultEl.className = 'result ' + (draw ? 'draw' : (won ? 'win' : 'lose'));
    endScoreEl.textContent = `${msg.score.blue} - ${msg.score.red}`;
    showOverlay(endOverlay);
    hud.hidden = true; hint.hidden = true;
}
return { goalPresentation, outNotice, showMatchEnd, dom: { $, hud, hint, scoreBlueEl, scoreRedEl, myFlagBlue, myFlagRed, matchClockEl, posLabelEl, connectOverlay, lobbyOverlay, endOverlay, disconnectOverlay, matchMenu, resumeBtn, leaveMatchBtn, serverInput, nameInput, connectBtn, connStatus, lobbyStatus, slotStatus, readyBtn, readyProgress, endResultEl, endScoreEl, disconnectMsg, reconnectBtn, lobbyLogo, countdownOverlay, countdownNumber, countdownSub, chatPanel, chatToggleBtn, chatMessages, chatForm, chatInput }, showOverlay, updateConnectionStatus, setMatchMenu, showCountdownOverlay, hideCountdownOverlay, applyStateHUD, updateClock };
}
