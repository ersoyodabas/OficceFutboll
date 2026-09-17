// Match countdown over the lobby line-up. The server owns the countdown; this
// only counts down the duration it announced, measured from the moment the
// message arrived, so a client clock that differs from the server's cannot skew
// the numbers. The server's matchStart (or the next snapshot) ends it.
export function createCountdown({ countdownOverlay, countdownNumber, countdownSub }) {
let endsAt = 0, rafId = null, shown = null;
function paint(text, go) {
  if (shown === text) return;
  shown = text;
  countdownNumber.textContent = text;
  countdownNumber.classList.toggle('go', go);
  countdownNumber.classList.remove('tick');
  void countdownNumber.offsetWidth;   // restart the pop for every new number
  countdownNumber.classList.add('tick');
}
function showCountdownOverlay(startAt, duration) {
  endsAt = performance.now() + Math.max(0, Number(duration) || 0);
  countdownOverlay.hidden = false;
  if (rafId) cancelAnimationFrame(rafId);
  const tick = () => {
    const remaining = endsAt - performance.now();
    if (remaining <= 0) {
      paint('MAÇ BAŞLIYOR!', true);
      countdownSub.textContent = '';
      rafId = null;
      return; // matchStart (or the next 'state') will hide the overlay
    }
    countdownSub.textContent = 'MAÇ BAŞLIYOR';
    paint(String(Math.ceil(remaining / 1000)), false);
    rafId = requestAnimationFrame(tick);
  };
  tick();
}

function hideCountdownOverlay() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  countdownOverlay.hidden = true;
  countdownNumber.classList.remove('go', 'tick');
  shown = null;
}
return { showCountdownOverlay, hideCountdownOverlay };
}
