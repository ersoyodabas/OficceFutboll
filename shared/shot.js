// Shot charge contract shared by the client power bar and the authoritative server.
export const SHOT_MAX_CHARGE_MS = 2000;

// 0..1 charge for a hold duration; holding longer than the maximum adds nothing.
export function shotChargeLevel(heldMs) {
  const ms = Number(heldMs);
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.min(ms / SHOT_MAX_CHARGE_MS, 1);
}
