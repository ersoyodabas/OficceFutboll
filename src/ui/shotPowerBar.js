import { shotChargeLevel, SHOT_MAX_CHARGE_MS } from '../../shared/shot.js';

// How long the full bar stays visible after the automatic maximum shot, measured
// on the same charge clock (no separate timer).
export const SHOT_BAR_COMPLETE_MS = 180;

// Segmented shot charge bar above the controlled player's name tag. The element
// and its segments live in game.html and are reused; each frame only updates
// styles. It keeps no timer, animation or smoothing of its own: start()
// receives the moment the charge began and update()/level() the current time on
// the same clock, so the bar shows the server's normalized 0..1 charge function
// (shared/shot.js) directly and reaches 100 % exactly SHOT_MAX_CHARGE_MS later.
export function createShotPowerBar(element) {
  const segments = [...element.querySelectorAll('.shot-power-segment')];
  let startedAt = null, completed = false;

  function paint(value) {
    // Segments fill left → right; the segment being filled fills smoothly.
    segments.forEach((segment, index) => {
      const fill = Math.min(1, Math.max(0, value * segments.length - index));
      segment.style.setProperty('--fill', String(fill));
    });
    element.classList.toggle('max', value >= 1);
  }
  function start(chargeStartedAt) {
    startedAt = chargeStartedAt;
    completed = false;
    paint(0);
  }
  function stop() {
    startedAt = null;
    completed = false;
    element.hidden = true;
    paint(0);
  }
  // The server fired at full charge: show 100 % until the brief hold ends.
  function complete() {
    if (startedAt === null) return;
    completed = true;
    paint(1);
  }
  const isCharging = () => startedAt !== null;
  const level = (now) => (startedAt === null ? 0 : completed ? 1 : shotChargeLevel(now - startedAt));

  // screen: { x, y, visible } in CSS pixels, or null when the player is not on screen.
  function update(now, screen) {
    if (startedAt === null) return;
    if (completed && now - startedAt >= SHOT_MAX_CHARGE_MS + SHOT_BAR_COMPLETE_MS) { stop(); return; }
    paint(level(now));
    if (screen) element.style.transform = `translate(${screen.x}px, ${screen.y}px) translate(-50%, -100%)`;
    element.hidden = !screen?.visible;
  }

  return { start, stop, complete, update, isCharging, level, startedAt: () => startedAt };
}
