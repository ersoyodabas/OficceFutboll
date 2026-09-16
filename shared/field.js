// Shared geometry only. Server gameplay tuning lives in server/core/config.js.
// Proportions follow the EA SPORTS FC Rush 5v5 pitch: 63.7 m × 46.6 m with
// regulation goals, enlarged penalty areas/circle and dotted offside lines at
// one third of the length. Marking sizes were measured from broadcast footage.
export const FIELD = Object.freeze({
    HALF_W: 23.3,
    HALF_L: 31.85,
    // Regulation 7.32 m × 2.44 m goal.
    GOAL_HALF_W: 3.66,
    GOAL_HEIGHT: 2.44,
    // Posts and crossbar (12 cm diameter) stand just behind the goal line.
    GOAL_POST_R: 0.06,
    BALL_R: 0.18,
    PLAYER_R: 0.48,
    LINE_WIDTH: 0.12,
    PENALTY_HALF_W: 11.7,
    PENALTY_DEPTH: 10.8,
    PENALTY_SPOT_DISTANCE: 6.6,
    CENTER_CIRCLE_R: 7,
    CORNER_ARC_R: 1,
    // Distance of each dotted offside line from its goal line.
    OFFSIDE_LINE_DISTANCE: 63.7 / 3,
    // Five selectable places per half, including one goalkeeper. Blue defends +Z.
    LOBBY_SLOTS: Object.freeze([
      Object.freeze({ position: 'KL', x: 0, z: 28 }),
      Object.freeze({ position: 'STP', x: 0, z: 19.5 }),
      Object.freeze({ position: 'SLK', x: -12.5, z: 12.5 }),
      Object.freeze({ position: 'SGK', x: 12.5, z: 12.5 }),
      Object.freeze({ position: 'FRV', x: 0, z: 6 }),
    ]),
  });
export const { HALF_W, HALF_L, GOAL_HALF_W, GOAL_HEIGHT, GOAL_POST_R, BALL_R, PLAYER_R } = FIELD;
