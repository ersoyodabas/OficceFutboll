import { FIELD } from '../../shared/field.js';
export const PORT = process.env.PORT || 3000;

export const TICK_HZ = 60;
export const BROADCAST_HZ = 20;
export const WIN_SCORE = 5;
export const GOAL_PAUSE_SECONDS = 4;
export const KICKOFF_PAUSE_SECONDS = 0.8;
export const MATCH_END_PAUSE_SECONDS = 6;

// ---------------------------------------------------------------------------
// Ready-up / auto-start config
// ---------------------------------------------------------------------------
export const MIN_PLAYERS_TO_START = 1; // solo practice and multiplayer use the same ready flow
export const COUNTDOWN_SECONDS = 3;
export const MATCH_DURATION_SECONDS = 300; // 5 minutes

export const { HALF_W, HALF_L, GOAL_HALF_W, GOAL_HEIGHT, BALL_R, PLAYER_R } = FIELD;

// ---------------------------------------------------------------------------
// Movement feel: speeds are caps; players accelerate toward them, brake when
// the input stops or points away, and turn at a rate that falls with speed.
// ---------------------------------------------------------------------------
export const PLAYER_SPEED = 6.8;            // jog cap, m/s
export const SPRINT_SPEED = 9.6;            // sprint cap, m/s
export const PLAYER_ACCELERATION = 15;      // m/s² toward the jog cap
export const PLAYER_SPRINT_ACCELERATION = 9; // m/s² above jog speed while sprinting
export const PLAYER_DECELERATION = 24;      // m/s² braking (no input, or input behind the body)
export const PLAYER_STAND_TURN_RATE = 10;   // rad/s when (nearly) standing
export const PLAYER_MAX_TURN_RATE = 5.2;    // rad/s at jog speed
export const PLAYER_SPRINT_TURN_RATE = 2.4; // rad/s at sprint speed: wide turns, no zig-zag
// While charging a shot the player plants: slower turning and reduced speed.
export const SHOT_CHARGE_TURN_FACTOR = 0.3;
export const SHOT_CHARGE_SPEED_FACTOR = 0.55;
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
export const AI_KEEPER_DISTRIBUTION_DELAY = 0.5;
export const AI_KEEPER_PASS_DISTANCE = 18;
export const MAX_BALL_SPEED = 36;
export const MAX_BALL_HEIGHT = 9;
// Fixed physics sub-step. 1/240 s keeps a 34 m/s ball to 14 cm per step, less
// than ball + post radius, so shots cannot tunnel through posts or the crossbar.
export const PHYSICS_STEP = 1 / 240;
export const PHYSICS_MAX_SUBSTEPS = 16;
export const GOAL_FRAME_RESTITUTION = 0.6;
export const GOAL_FRAME_FRICTION = 0.1;
// Outfield players only block balls up to head height.
export const PLAYER_COLLISION_HEIGHT = 1.85;

// ---------------------------------------------------------------------------
// Out of play (AUT) and goal kicks. A ball that fully crosses a goal line
// outside the goal mouth stops play for OUT_OF_PLAY_SECONDS, then the
// defending goalkeeper restarts with the ball inside the penalty area.
// ---------------------------------------------------------------------------
export const OUT_OF_PLAY_SECONDS = 2;
export const GOAL_KICK_DISTANCE = 4.5;      // ball distance from the goal line
export const GOAL_KICK_MAX_SIDE = 2.5;      // ball x offset toward the side it went out
export const GOAL_KICK_KEEPER_OFFSET = 1.08; // keeper stands behind the ball

// ---------------------------------------------------------------------------
// AI goalkeeper. The keeper is a body with limited reach, not a wall: it
// positions between ball and goal, reacts to shots after a delay, dives at a
// limited speed and distance, catches slower balls it reaches and parries
// harder ones. Anything outside its reach can score.
// ---------------------------------------------------------------------------
export const KEEPER_POSITION_SPEED = 4.2;   // m/s while positioning
export const KEEPER_LATERAL_FACTOR = 0.28;  // share of ball x the keeper mirrors on its line
export const KEEPER_MAX_SIDE = 2.6;         // m from goal centre while positioning
export const KEEPER_MIN_DEPTH = 0.4;        // m off the goal line
export const KEEPER_MAX_DEPTH = 1.6;
export const KEEPER_REACTION_MS = 200;      // delay before diving at a shot
export const KEEPER_DIVE_SPEED = 5.5;       // m/s lateral dive speed
export const KEEPER_MAX_DIVE = 2.2;         // m of lateral dive from where the shot was read
export const KEEPER_BODY_REACH = 0.55;      // m from body axis: torso and arms when set
export const KEEPER_DIVE_REACH = 0.95;      // m from body axis at full stretch in a dive
export const KEEPER_REACH_HEIGHT = 2.0;     // m: highest ball the keeper can touch
export const KEEPER_CATCH_MAX_SPEED = 17;   // m/s: faster balls are parried, not held
export const KEEPER_PARRY_RESTITUTION = 0.35;
export const KEEPER_COLLECT_RANGE = 1.2;    // m: loose slow balls (back-passes) the keeper gathers
export const KEEPER_COLLECT_MAX_SPEED = 5;  // m/s

// ---------------------------------------------------------------------------
// Charged shots (S held with possession). charge = held time / SHOT_MAX_CHARGE_MS
// (0..1, shared/shot.js), measured on the server clock only; a full 2 s hold
// fires automatically at charge 1.
//   speed = lerp(SHOT_MIN_SPEED, SHOT_MAX_SPEED, charge ^ SHOT_SPEED_EXPONENT)
//   lift  = lerp(SHOT_MIN_LIFT,  SHOT_MAX_LIFT,  charge ^ SHOT_LIFT_EXPONENT)
// Speed rises early (taps stay usable); lift rises late, so from ~16 m:
//   0–30 %  ≈15–23 m/s, low and controlled (usually bounces before goal)
//   30–65 % ≈23–29 m/s, moderate lift, arrives around waist to head height
//   65–85 % ≈29–32 m/s, powerful, near the crossbar
//   85–100% ≈32–34 m/s, highest trajectory: can sail over the crossbar
// Nothing keeps a shot under the bar; the physics decides.
// ---------------------------------------------------------------------------
export { SHOT_MAX_CHARGE_MS } from '../../shared/shot.js';
export const SHOT_MIN_SPEED = 15;          // m/s horizontal, quick tap
export const SHOT_MAX_SPEED = 34;          // m/s horizontal, full 2 s charge (~122 km/h)
export const SHOT_SPEED_EXPONENT = 0.7;
export const SHOT_MIN_LIFT = 1.4;          // m/s vertical
export const SHOT_MAX_LIFT = 8.5;
export const SHOT_LIFT_EXPONENT = 1.6;
// Accuracy trade-off: above this charge the launch direction wobbles a little,
// up to ±SHOT_MAX_INACCURACY_DEG at full power.
export const SHOT_INACCURACY_FROM_CHARGE = 0.75;
export const SHOT_MAX_INACCURACY_DEG = 2.5;
// Curve: left/right input while charging (relative to the shooter) builds a
// curve intent in [-1, 1]; it becomes sidespin up to MAX_SHOT_SPIN. The ball is
// launched slightly to the outside so the Magnus force bends it back in.
export const SHOT_CURVE_RESPONSE = 5;      // 1/s, how fast intent follows the held direction
export const MAX_SHOT_SPIN = 55;           // rad/s sidespin (~9 rev/s)
export const SHOT_CURL_LAUNCH_ANGLE_DEG = 6;
// Magnus force F = MAGNUS_COEFFICIENT · (ω_y × v_horizontal). ½·ρ·A·r for a
// real ball is ≈0.0026 kg; with the 0.45 kg ball that is ~8 m/s² sideways at
// 25 m/s and full spin, fading naturally as the ball slows.
export const MAGNUS_COEFFICIENT = 0.0027;
export const MAGNUS_MIN_SPEED = 2;         // m/s; below this the ball just rolls

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
