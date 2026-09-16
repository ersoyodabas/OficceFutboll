// Exact existing wire names. Both client and server import this contract.
export const CLIENT = Object.freeze({
  JOIN: 'join', SELECT_SLOT: 'select_slot', READY: 'ready',
  INPUT: 'input', ACTION: 'action', LEAVE_MATCH: 'leave_match',
  SEND_CHAT_MESSAGE: 'send_chat_message', LOBBY_SFX: 'lobby_sfx',
});
export const SERVER = Object.freeze({
  LOBBY: 'lobby', WELCOME: 'welcome', SLOT_ERROR: 'slot_error',
  LOBBY_RETURNED: 'lobby_returned', COUNTDOWN_START: 'countdownStart',
  COUNTDOWN_CANCELLED: 'countdownCancelled', MATCH_START: 'matchStart',
  STATE: 'state', ACTION_RESULT: 'actionResult', MATCH_END: 'match_end',
  NEW_CHAT_MESSAGE: 'new_chat_message', LOBBY_SFX: 'lobby_sfx',
});
