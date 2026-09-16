import { shotChargeLevel } from '../../shared/shot.js';

// Segmented shot charge bar above the controlled player's name tag. The element
// and its segments live in game.html and are reused; each frame only updates
// styles. It is presentation only: the server times the real charge.
export function createShotPowerBar(element) {
  const segments = [...element.querySelectorAll('.shot-power-segment')];
  let startedAt = null;

  function paint(value) {
    // Segments fill left → right; the segment being filled fills smoothly.
    segments.forEach((segment, index) => {
      const fill = Math.min(1, Math.max(0, value * segments.length - index));
      segment.style.setProperty('--fill', String(fill));
    });
    element.classList.toggle('max', value >= 1);
  }
  function start(now) {
    startedAt = now;
    paint(0);
  }
  function stop() {
    startedAt = null;
    element.hidden = true;
    paint(0);
  }
  const isCharging = () => startedAt !== null;
  const level = (now) => (startedAt === null ? 0 : shotChargeLevel(now - startedAt));

  // screen: { x, y, visible } in CSS pixels, or null when the player is not on screen.
  function update(now, screen) {
    if (startedAt === null) return;
    paint(level(now));
    if (screen) element.style.transform = `translate(${screen.x}px, ${screen.y}px) translate(-50%, -100%)`;
    element.hidden = !screen?.visible;
  }

  return { start, stop, update, isCharging, level };
}
