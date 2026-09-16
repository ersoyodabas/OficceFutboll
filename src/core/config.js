export const TEAM_COLOR = { blue: 0x2d8fe0, red: 0xe0503d };

// ---------- Broadcast camera tuning (FIFA/EA FC style sideline camera) ----------
// The camera sits off to one side of the pitch (beyond the touchline) and pans
// along the pitch's length (Z) as play moves, so the pitch reads horizontally
// on screen — this is a fixed sideline "TV" framing, not a per-player chase cam,
// and it does not mirror by team (a real broadcast camera doesn't flip ends
// depending on who has the ball).
export const CAMERA_HEIGHT = 20;
export const CAMERA_SIDE_DISTANCE = 30;
export const CAMERA_FOV = 36;
export const PLAYER_ROTATION_SPEED = 9;

// ---------- Visual-only scale (kept separate from server physics dimensions) ----------
export const PLAYER_VISUAL_SCALE = 1.18;
export const BALL_VISUAL_SCALE = 0.9;

// ---------- Default LAN server ----------
export const DEFAULT_SERVER_URL = 'ws://10.17.12.93:3000';
export const SERVER_STORAGE_KEY = 'officeFootballServer';
