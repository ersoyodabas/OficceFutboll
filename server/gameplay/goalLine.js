import { HALF_W, HALF_L, GOAL_HALF_W, GOAL_HEIGHT, BALL_R } from '../../shared/field.js';
import { MAX_BALL_SPEED } from '../core/config.js';

// A ball is over a goal line only when all of it has crossed: its centre is
// beyond HALF_L + BALL_R (lines belong to the pitch).
export const GOAL_LINE_CROSSING_Z = HALF_L + BALL_R;

// True when the ball moved further in one tick than it physically can, i.e. it
// was placed directly (restart, test fixture). Crossing geometry then uses the
// new position instead of interpolating along a path that never happened.
export function isTeleport(previous, current, dt) {
  if (!previous) return true;
  const moved = Math.hypot(current.x - previous.x, current.y - previous.y, current.z - previous.z);
  return moved > MAX_BALL_SPEED * Math.max(dt, 1 / 60) * 2 + 1;
}

// Decides what happened when the ball crossed a goal line between two ticks.
// Returns null while the ball is still in play, otherwise
// { end: 1 | -1, goal, x, y } where end is the sign of the goal line's Z and
// x/y is where the ball's centre passed through the crossing plane.
// A goal needs the whole ball inside the real mouth: between the inner faces of
// the posts and below the underside of the crossbar. Everything else is out.
export function classifyGoalLineCrossing(previous, current, dt) {
  const end = current.z > GOAL_LINE_CROSSING_Z ? 1 : current.z < -GOAL_LINE_CROSSING_Z ? -1 : 0;
  if (!end) return null;
  let x = current.x, y = current.y;
  const planeZ = end * GOAL_LINE_CROSSING_Z;
  if (!isTeleport(previous, current, dt) && Math.abs(previous.z) <= GOAL_LINE_CROSSING_Z && previous.z !== current.z) {
    const t = (planeZ - previous.z) / (current.z - previous.z);
    x = previous.x + (current.x - previous.x) * t;
    y = previous.y + (current.y - previous.y) * t;
  }
  const goal = Math.abs(x) <= GOAL_HALF_W - BALL_R && y <= GOAL_HEIGHT - BALL_R;
  return { end, goal, x, y };
}

// A ball is over a touchline only when all of it has crossed.
export const TOUCHLINE_CROSSING_X = HALF_W + BALL_R;

// Which boundary the ball's path crossed first between two ticks, or null while
// it is in play:
//   { boundary: 'goalLine', end, goal, x, y }  — see classifyGoalLineCrossing
//   { boundary: 'touchline', side: 1 | -1, x, y, z } — side is the sign of X
// Along a real path the earlier crossing wins (a ball leaving at a corner);
// for a placed ball the goal line is judged first.
export function classifyBoundaryCrossing(previous, current, dt) {
  const overGoalLine = Math.abs(current.z) > GOAL_LINE_CROSSING_Z;
  const overTouchline = Math.abs(current.x) > TOUCHLINE_CROSSING_X;
  if (!overGoalLine && !overTouchline) return null;
  const teleport = isTeleport(previous, current, dt);
  const crossingT = (axis, plane) => {
    if (teleport) return 1;
    const from = previous[axis], to = current[axis];
    if (Math.abs(from) > plane || from === to) return 1;
    return (Math.sign(to) * plane - from) / (to - from);
  };
  const goalT = overGoalLine ? crossingT('z', GOAL_LINE_CROSSING_Z) : Infinity;
  const touchT = overTouchline ? crossingT('x', TOUCHLINE_CROSSING_X) : Infinity;
  if (goalT <= touchT) return { boundary: 'goalLine', ...classifyGoalLineCrossing(previous, current, dt) };
  const side = Math.sign(current.x);
  const at = (axis) => (teleport ? current[axis] : previous[axis] + (current[axis] - previous[axis]) * touchT);
  return { boundary: 'touchline', side, x: side * HALF_W, y: at('y'), z: at('z') };
}
