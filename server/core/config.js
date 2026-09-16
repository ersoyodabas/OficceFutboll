import { FIELD } from '../../shared/field.js';
export const PORT = process.env.PORT || 3000;

export const TICK_HZ = 60;
export const BROADCAST_HZ = 20;
export const WIN_SCORE = 5;
export const GOAL_PAUSE_SECONDS = 1.5;
export const MATCH_END_PAUSE_SECONDS = 6;

// ---------------------------------------------------------------------------
// Ready-up / auto-start config
// ---------------------------------------------------------------------------
export const MIN_PLAYERS_TO_START = 1; // solo practice and multiplayer use the same ready flow
export const COUNTDOWN_SECONDS = 3;
export const MATCH_DURATION_SECONDS = 300; // 5 minutes

export const { HALF_W, HALF_L, GOAL_HALF_W, GOAL_HEIGHT, BALL_R, PLAYER_R } = FIELD;

export const PLAYER_SPEED = 7.3;
export const SPRINT_SPEED = 10.7;
export const POSSESSION_RANGE = 1.15;
export const ACTION_RANGE = POSSESSION_RANGE * 1.9;
export const STANDING_TACKLE_RANGE = 2.1;
export const SLIDE_TACKLE_RANGE = 2.7;
export const SLIDE_SPEED = 12.5;
export const SLIDE_DURATION = 0.58;
export const SLIDE_RECOVERY = 0.35;
export const SLIDE_FOOT_OFFSET = 1.05;
export const SLIDE_BALL_CAPTURE_RADIUS = 0.82;
export const SLIDE_BALL_CONTROL_OFFSET = 1.08;
export const ACTION_COOLDOWNS = Object.freeze({ A: 0.42, S: 0.7, D: 0.95 });
export const STANDING_TACKLE_COOLDOWN = 0.85;
export const SLIDE_TACKLE_COOLDOWN = 1.8;
export const MAX_BALL_SPEED = 23;
export const MAX_BALL_HEIGHT = 9;

// Pitch bounds every position is clamped into, regardless of its own range.
export const PITCH_MIN_X = -HALF_W + PLAYER_R;
export const PITCH_MAX_X = HALF_W - PLAYER_R;
export const PITCH_MIN_Z = -HALF_L + PLAYER_R;
export const PITCH_MAX_Z = HALF_L - PLAYER_R;

// ---------------------------------------------------------------------------
// Positions: each has a home anchor and a roaming range, expressed in the
// "blue" team's frame (positive Z = blue's own defensive third). Red is the
// mirror image on Z; X is shared (left/right stays visually consistent for
// both teams on the shared pitch).
// ---------------------------------------------------------------------------
export const POSITIONS = {
  KL: { label: 'Kaleci', x: 0, zHome: HALF_L * .86, zRange: [HALF_L * .68, HALF_L * .94], xRange: null },
  STP: { label: 'Stoper', x: 0, zHome: HALF_L * .55, zRange: [-HALF_L * .15, HALF_L * .88], xRange: null },
  SLB: { label: 'Sol Bek', x: -HALF_W * .62, zHome: HALF_L * .45, zRange: [-HALF_L * .45, HALF_L * .85], xRange: [-HALF_W, HALF_W * .2] },
  SGB: { label: 'Sağ Bek', x: HALF_W * .62, zHome: HALF_L * .45, zRange: [-HALF_L * .45, HALF_L * .85], xRange: [-HALF_W * .2, HALF_W] },
  DOS: { label: 'Def. Orta Saha', x: 0, zHome: HALF_L * .28, zRange: [-HALF_L * .55, HALF_L * .78], xRange: null },
  OOS: { label: 'Orta Saha', x: 0, zHome: 0, zRange: [-HALF_L * .82, HALF_L * .82], xRange: null },
  SLK: { label: 'Sol Kanat', x: -HALF_W * .72, zHome: -HALF_L * .18, zRange: [-HALF_L * .93, HALF_L * .35], xRange: [-HALF_W, HALF_W * .15] },
  SGK: { label: 'Sağ Kanat', x: HALF_W * .72, zHome: -HALF_L * .18, zRange: [-HALF_L * .93, HALF_L * .35], xRange: [-HALF_W * .15, HALF_W] },
  FRV: { label: 'Forvet', x: 0, zHome: -HALF_L * .52, zRange: [-HALF_L * .94, HALF_L * .38], xRange: null },
};
export const DEFAULT_POSITION = 'OOS';

export function positionFor(code) {
  return POSITIONS[code] ? code : DEFAULT_POSITION;
}
