// Centred out-of-play notice (AUT!!!, TAÇ!!!, KORNER!!!). One reusable DOM tree;
// the text and restart come from the server's outEvent, and the animation
// length is seeked by server time, so every client (including late joiners)
// shows the same moment.
const NOTICE_TEXT = { AUT: 'AUT!!!', TAÇ: 'TAÇ!!!', KORNER: 'KORNER!!!' };
const RESTART_TEXT = { goalKick: 'KALE VURUŞU', throwIn: 'TAÇ ATIŞI', corner: 'KORNER VURUŞU', keeperRestart: 'KALECİ OYUNU BAŞLATIYOR' };
export function createOutNotice({ parent = document.body } = {}) {
  const root = document.createElement('section');
  root.id = 'outNotice';
  root.className = 'out-notice';
  root.hidden = true;
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'assertive');
  root.innerHTML = `<div class="out-notice-band">
    <span class="out-notice-text">AUT!!!</span>
    <span class="out-notice-sub">KALE VURUŞU</span>
  </div>`;
  parent.append(root);

  function show(outEvent, serverTime) {
    root.querySelector('.out-notice-text').textContent = NOTICE_TEXT[outEvent.notice] || NOTICE_TEXT.AUT;
    root.querySelector('.out-notice-sub').textContent = RESTART_TEXT[outEvent.restart] || '';
    const duration = Math.max(1, outEvent.endsAt - outEvent.startedAt);
    root.style.setProperty('--out-duration', duration + 'ms');
    root.style.setProperty('--out-delay', -Math.max(0, Math.min(duration, serverTime - outEvent.startedAt)) + 'ms');
    root.hidden = false;
    root.classList.remove('is-active');
    void root.offsetWidth; // restart the animation
    root.classList.add('is-active');
  }
  function hide() { root.hidden = true; root.classList.remove('is-active'); }
  function dispose() { root.remove(); }
  return { show, hide, dispose };
}
