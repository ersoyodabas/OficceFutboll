// Exact existing wire names. Both client and server import this contract.
export const CLIENT = Object.freeze({
  JOIN: 'join', SELECT_SLOT: 'select_slot', READY: 'ready',
  UPDATE_PROFILE: 'update_profile',
  SELECT_CLUB_KIT: 'select_club_kit',
  INPUT: 'input', ACTION: 'action', LEAVE_MATCH: 'leave_match',
  SHOT_CHARGE_START: 'shot_charge_start', SHOT_RELEASE: 'shot_release', SHOT_CANCEL: 'shot_cancel',
  SEND_CHAT_MESSAGE: 'send_chat_message', LOBBY_SFX: 'lobby_sfx',
});
export const SERVER = Object.freeze({
  LOBBY: 'lobby', WELCOME: 'welcome', SLOT_ERROR: 'slot_error',
  PROFILE_UPDATED: 'profileUpdated', PROFILE_ERROR: 'profileError',
  CLUB_ERROR: 'club_error',
  LOBBY_RETURNED: 'lobby_returned', COUNTDOWN_START: 'countdownStart',
  COUNTDOWN_CANCELLED: 'countdownCancelled', MATCH_START: 'matchStart',
  STATE: 'state', ACTION_RESULT: 'actionResult', MATCH_END: 'match_end',
  GOAL: 'goal', KICKOFF_RESET: 'kickoffReset', OUT_OF_PLAY: 'outOfPlay', GOAL_KICK: 'goalKick',
  NEW_CHAT_MESSAGE: 'new_chat_message', LOBBY_SFX: 'lobby_sfx',
});
