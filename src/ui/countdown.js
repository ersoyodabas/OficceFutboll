export function createCountdown({ countdownOverlay, countdownNumber, countdownSub }) {
let countdownEndAt = 0, countdownRafId = null;
function showCountdownOverlay(startAt, duration) {
  countdownEndAt = startAt + duration;
  countdownOverlay.hidden = false;
  if (countdownRafId) cancelAnimationFrame(countdownRafId);
  const tick = () => {
    const remainingMs = countdownEndAt - Date.now();
    if (remainingMs <= 0) {
      countdownNumber.textContent = 'MAÇ BAŞLIYOR!';
      countdownNumber.classList.add('go');
      countdownSub.textContent = '';
      countdownRafId = null;
      return; // matchStart (or the next 'state') will hide the overlay
    }
    const secondsLeft = Math.ceil(remainingMs / 1000);
    countdownNumber.textContent = String(secondsLeft);
    countdownNumber.classList.remove('go');
    countdownSub.textContent = 'MAÇ BAŞLIYOR';
    countdownRafId = requestAnimationFrame(tick);
  };
  tick();
}

function hideCountdownOverlay() {
  if (countdownRafId) { cancelAnimationFrame(countdownRafId); countdownRafId = null; }
  countdownOverlay.hidden = true;
  countdownNumber.classList.remove('go');
}
return { showCountdownOverlay, hideCountdownOverlay };
}
