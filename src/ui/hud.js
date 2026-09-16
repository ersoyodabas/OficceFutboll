import { formatClock } from './matchTimer.js';
import { createCountdown } from './countdown.js';
import { keyLabel } from './settings.js';
export function createUI({ state, canvas, onClearInput, onLeaveMatch, preferences }) {
const $ = (id) => document.getElementById(id);

const hud = $('hud');
const hint = $('hint');
const scoreBlueEl = $('scoreBlue');
const scoreRedEl = $('scoreRed');
const myFlagBlue = $('myFlagBlue');
const myFlagRed = $('myFlagRed');
const matchClockEl = $('matchClock');
const posLabelEl = $('posLabel');

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

const copyInviteLinkBtn = $('copyInviteLinkBtn');
const inviteLinkStatus = $('inviteLinkStatus');

const countdownOverlay = $('countdownOverlay');
const countdownNumber = $('countdownNumber');
const countdownSub = $('countdownSub');
const { showCountdownOverlay, hideCountdownOverlay } = createCountdown({ countdownOverlay, countdownNumber, countdownSub });
function showOverlay(el) {
  setMatchMenu(false);
  settingsOverlay.hidden = true;
  [connectOverlay, lobbyOverlay, endOverlay, disconnectOverlay].forEach((o) => { o.hidden = (o !== el); });
}
function updateConnectionStatus(state, detail) {
  connStatus.classList.remove('error', 'success');
  switch (state) {
    case 'connecting':
      connStatus.textContent = 'Bağlanıyor…';
      break;
    case 'connected':
      connStatus.textContent = detail ? `Bağlandı — ${detail}` : 'Bağlandı';
      connStatus.classList.add('success');
      break;
    case 'failed':
      connStatus.textContent = 'Sunucuya bağlanılamadı. Adresi kontrol et.';
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
  if (open && (state.phase !== 'playing' || state.waitingInLobby || !state.joined)) return;
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
  scoreBlueEl.textContent = msg.score.blue;
  scoreRedEl.textContent = msg.score.red;
  if (!matchMenu.hidden) $('menuScore').textContent = `${msg.score.blue} : ${msg.score.red}`;
  myFlagBlue.hidden = state.myTeam !== 'blue';
  myFlagRed.hidden = state.myTeam !== 'red';
  if (state.positionsData && state.positionsData[state.myPosition]) {
    posLabelEl.textContent = `Mevkin: ${state.myPosition} — ${state.positionsData[state.myPosition].label}`;
  }


}
function updateClock() { if (state.serverMatchStartedAt > 0) matchClockEl.textContent = formatClock(Date.now() - state.serverMatchStartedAt); }
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
return { showMatchEnd, dom: { $, hud, hint, scoreBlueEl, scoreRedEl, myFlagBlue, myFlagRed, matchClockEl, posLabelEl, connectOverlay, lobbyOverlay, endOverlay, disconnectOverlay, matchMenu, resumeBtn, leaveMatchBtn, serverInput, nameInput, connectBtn, connStatus, lobbyStatus, slotStatus, readyBtn, readyProgress, endResultEl, endScoreEl, disconnectMsg, reconnectBtn, copyInviteLinkBtn, inviteLinkStatus, countdownOverlay, countdownNumber, countdownSub }, showOverlay, updateConnectionStatus, setMatchMenu, showCountdownOverlay, hideCountdownOverlay, applyStateHUD, updateClock };
}
