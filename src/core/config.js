export const TEAM_COLOR = { blue: 0x2d8fe0, red: 0xe0503d };

// ---------- Broadcast camera tuning (EA FC Rush style main-stand camera) ----------
// A long-lens camera high in the main stand, calibrated against Rush broadcast
// footage: 53 m behind the near touchline, 21.5 m up, tilted 16° down with a
// ~25° horizontal field of view. It pans only along the pitch length (Z) and
// never mirrors by team, like a real TV camera.
export const CAMERA_DISTANCE = 76.5; // from the pitch centre line, along +X
export const CAMERA_HEIGHT = 21.5;
export const CAMERA_TILT_DEG = 16;
export const CAMERA_HFOV_DEG = 24.8;
export const CAMERA_MIN_VFOV_DEG = 14.2;
// Furthest the view centre travels toward a goal; the goal line then sits ~13 m right of centre.
export const CAMERA_PAN_LIMIT = 18.8;
export const PLAYER_ROTATION_SPEED = 9;

// ---------- Visual-only scale (kept separate from server physics dimensions) ----------
export const PLAYER_VISUAL_SCALE = 1;
export const BALL_VISUAL_SCALE = 0.7;

// ---------- LAN server (fixed, not shown in the UI; used by the extension page) ----------
export const DEFAULT_SERVER_URL = 'ws://10.17.12.93:3000';
