export const PLAYER_NAME_MAX_LENGTH = 20;

export function validatePlayerName(value) {
  if (typeof value !== 'string') return { error: 'Geçerli bir oyuncu adı yaz.' };
  const name = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (!name) return { error: 'Oyuncu adı boş bırakılamaz.' };
  if (Array.from(name).length > PLAYER_NAME_MAX_LENGTH) return { error: `En fazla ${PLAYER_NAME_MAX_LENGTH} karakter kullan.` };
  if (/[\p{Cc}\p{Cf}]/u.test(value) || /[^\p{L}\p{M}\p{N} ._'’\-]/u.test(name) || !/[\p{L}\p{N}]/u.test(name)) {
    return { error: 'Harf, rakam, boşluk, nokta, kesme işareti, alt çizgi veya tire kullan.' };
  }
  return { name };
}
