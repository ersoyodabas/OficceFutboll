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
// the input stops or points away, and turn with a limited angular speed that
// itself has to build up and ease off (angular acceleration). Both fall as the
// player runs faster, so sprinters take wide, heavy turns and cannot zig-zag.
// ---------------------------------------------------------------------------
export const PLAYER_SPEED = 5.8;            // jog cap, m/s
export const SPRINT_SPEED = 8.8;            // sprint cap, m/s
export const PLAYER_ACCELERATION = 9;       // m/s² toward the jog cap
export const PLAYER_SPRINT_ACCELERATION = 6; // m/s² above jog speed while sprinting
export const PLAYER_DECELERATION = 14;      // m/s² braking (no input, or input behind the body)
export const PLAYER_STAND_TURN_RATE = 5.5;  // rad/s max angular speed when (nearly) standing
export const PLAYER_MAX_TURN_RATE = 3;      // rad/s at jog speed
export const PLAYER_SPRINT_TURN_RATE = 1.5; // rad/s at sprint speed: wide turns, no zig-zag
// rad/s² with the standing turn rate; scaled down with the turn rate as speed rises.
export const PLAYER_TURN_ACCELERATION = 18;
// While charging a shot the player plants: turning almost stops, so left/right
// input becomes a small aim adjustment instead of a body turn.
export const SHOT_CHARGE_TURN_FACTOR = 0.12;
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
export const MAX_BALL_SPEED = 46;
export const MAX_BALL_HEIGHT = 9;
// Ball body. The physics world and the shot aim solver (shotAim.js) both use these.
export const GRAVITY = 9.82;               // m/s²
export const BALL_MASS = 0.45;             // kg
export const BALL_LINEAR_DAMPING = 0.35;
// Sidespin from a curled shot decays over roughly a second of flight.
export const BALL_ANGULAR_DAMPING = 0.3;
// Share of the ball's previous velocity every kick keeps (dribbling momentum).
export const KICK_RETAINED_VELOCITY = 0.35;
// A struck shot starts this far above the grass. Left touching the ground for
// the kick's physics step, contact friction removes ~2.5 m/s from each pitch
// axis separately, which scrubs pace and bends every angled shot toward the
// pitch axes (a 10° aim came out at ~7°).
export const SHOT_LIFTOFF_HEIGHT = 0.02;   // m
// Fixed physics sub-step. 1/240 s keeps even a 44 m/s rocket to 18 cm per step,
// less than ball + post radius, so shots cannot tunnel through posts or the crossbar.
export const PHYSICS_STEP = 1 / 240;
export const PHYSICS_MAX_SUBSTEPS = 16;
export const GOAL_FRAME_RESTITUTION = 0.6;
export const GOAL_FRAME_FRICTION = 0.1;
// Outfield players only block balls up to head height.
export const PLAYER_COLLISION_HEIGHT = 1.85;

// ---------------------------------------------------------------------------
// Out of play and restarts. A ball that fully crosses a touchline (TAÇ) or a
// goal line outside the goal mouth stops play for OUT_OF_PLAY_SECONDS; the team
// that did not touch it last then restarts:
//   touchline                    → throw-in by the nearest opposing outfield player
//   goal line, attackers last    → goal kick by the defending goalkeeper (AUT)
//   goal line, defenders last    → corner by the nearest attacking outfield player
// With no outfield player available, the receiving goalkeeper restarts instead.
// ---------------------------------------------------------------------------
export const OUT_OF_PLAY_SECONDS = 2;
export const GOAL_KICK_DISTANCE = 4.5;      // ball distance from the goal line
export const GOAL_KICK_MAX_SIDE = 2.5;      // ball x offset toward the side it went out
export const GOAL_KICK_KEEPER_OFFSET = 1.08; // keeper stands behind the ball
export const RESTART_EDGE_MARGIN = 1.5;     // throw-ins stay this far from the corners
export const RESTART_OPPONENT_DISTANCE = 3; // opponents are moved at least this far from the ball

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
export const KEEPER_DIVE_SPEED = 4.5;       // m/s lateral dive speed
export const KEEPER_MAX_DIVE = 1.8;         // m of lateral dive from where the shot was read
export const KEEPER_BODY_REACH = 0.55;      // m from body axis: torso and arms when set
export const KEEPER_DIVE_REACH = 0.85;      // m from body axis at full stretch in a dive
export const KEEPER_REACH_HEIGHT = 2.0;     // m: highest ball the keeper can touch
export const KEEPER_BODY_DEPTH = 0.25;     // m: a ball further behind the keeper (goal side) is past them
export const KEEPER_CATCH_MAX_SPEED = 17;   // m/s: faster balls are parried, not held
export const KEEPER_PARRY_RESTITUTION = 0.35;
export const KEEPER_COLLECT_RANGE = 1.2;    // m: loose slow balls (back-passes) the keeper gathers
export const KEEPER_COLLECT_MAX_SPEED = 5;  // m/s

// ---------------------------------------------------------------------------
// Charged shots (S held with possession). charge = held time / SHOT_MAX_CHARGE_MS
// (0..1, shared/shot.js), measured on the server clock only; a full 2 s hold
// fires automatically at charge 1. The client power bar uses the same function.
//   speed = lerp(SHOT_MIN_SPEED, SHOT_MAX_SPEED, charge ^ SHOT_SPEED_EXPONENT)
//   lift  = lerp(SHOT_MIN_LIFT,  SHOT_MAX_LIFT,  charge ^ SHOT_LIFT_EXPONENT)
// Speed bands (horizontal):
//   0–50 %  normal     16–27 m/s
//   50–80 % strong     27–37 m/s
//   80–100 % very fast 37–44 m/s, 100 % = 44 m/s (~158 km/h) rocket
// Lift grows more slowly, so a straight shot stays around the middle of the goal
// at any power; above SHOT_LIFT_VARIATION_FROM_CHARGE the lift varies up to
// ±SHOT_MAX_LIFT_VARIATION, so a full-power strike can still rise over the bar.
// ---------------------------------------------------------------------------
export { SHOT_MAX_CHARGE_MS } from '../../shared/shot.js';
export const SHOT_MIN_SPEED = 16;          // m/s horizontal, quick tap
export const SHOT_MAX_SPEED = 44;          // m/s horizontal, full 2 s charge
export const SHOT_SPEED_EXPONENT = 1.35;   // > 1: most of the extra pace comes in the last part of the charge
export const SHOT_MIN_LIFT = 1.2;          // m/s vertical
export const SHOT_MAX_LIFT = 5;
export const SHOT_LIFT_EXPONENT = 1.2;
export const SHOT_LIFT_VARIATION_FROM_CHARGE = 0.8;
export const SHOT_MAX_LIFT_VARIATION = 0.35; // fraction of the lift at full charge
// Aim: shots follow the shooter's facing. Left/right input held before or
// during the charge (relative to the shooter) sets an aim intent in [-1, 1]
// that turns the shot up to SHOT_AIM_MAX_DEG toward that side — enough to pick a
// corner from the edge of the box — with no random sideways deviation. A small
// sidespin in the same direction adds a subtle finesse curl.
export const SHOT_AIM_RESPONSE = 6;        // 1/s, how fast aim follows the held direction
export const SHOT_AIM_MAX_DEG = 7;
export const MAX_SHOT_SPIN = 20;           // rad/s sidespin at full aim (subtle curl)
export const SHOT_CURL_LAUNCH_ANGLE_DEG = 1.5; // launched slightly inside the aim, curling out to it
// Top corners ("doksan"): above SHOT_CORNER_FROM_CHARGE, left/right aim pulls the
// shot toward the upper corner on that side of the goal the shooter is facing.
// The server solves the yaw and lift that reach the corner target (gravity,
// damping and curl included) and blends toward it by
//   pull = ((charge - FROM) / (1 - FROM)) ^ SHOT_CORNER_CHARGE_EXPONENT · min(1, |aim| · SHOT_CORNER_AIM_GAIN)
// e.g. full aim: 80 % ≈ 0.46, 90 % ≈ 0.72, 100 % = 1. Straight shots (no aim)
// are never steered. The target has a random error that grows with distance,
// so corner shots can still hit the post or crossbar, go wide or over, or be saved.
export const SHOT_CORNER_FROM_CHARGE = 0.5;
export const SHOT_CORNER_CHARGE_EXPONENT = 1.5;
export const SHOT_CORNER_AIM_GAIN = 2;          // a slight aim (|aim| ≥ 0.5) already picks the corner fully
export const SHOT_CORNER_INSET = 0.6;           // m, ball centre inside the post (posts at ±3.66 m)
export const SHOT_CORNER_HEIGHT = 2.0;          // m, ball centre at the goal line (crossbar underside 2.44 m)
export const SHOT_CORNER_SCATTER = 0.55;        // ± m sideways error at the reference distance
export const SHOT_CORNER_HEIGHT_SCATTER = 0.35; // ± m vertical error at the reference distance
export const SHOT_CORNER_REFERENCE_DISTANCE = 16; // m; the error scales with distance (×0.5 … ×1.6)
export const SHOT_CORNER_MAX_DISTANCE = 32;     // m to the goal line; longer shots are not steered
export const SHOT_CORNER_FACING_MARGIN = 3;     // m outside a post the facing may point and still be steered
export const SHOT_CORNER_MAX_YAW_DEG = 18;      // never turned further than this from the facing
export const SHOT_CORNER_MAX_LIFT = 9;          // m/s
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
