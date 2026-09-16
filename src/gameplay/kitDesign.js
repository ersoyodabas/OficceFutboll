// Shared procedural design for the 3D shirt and lobby preview. Textures can be
// substituted at this material boundary without adding player model variants.
export function drawKitFabric(ctx, size, kit, number = null, playerName = '') {
  ctx.fillStyle = kit.primaryColor; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = kit.secondaryColor;
  if (kit.pattern === 'split') ctx.fillRect(size * .55, 0, size * .45, size);
  else if (kit.pattern === 'bars') {
    ctx.fillRect(size * .14, 0, size * .12, size); ctx.fillRect(size * .57, 0, size * .18, size);
  } else {
    ctx.beginPath(); ctx.moveTo(0, size * .12); ctx.lineTo(size, size * .38);
    ctx.lineTo(size, size * .53); ctx.lineTo(0, size * .27); ctx.fill();
  }
  // Original small shoulder seams; no sponsor/manufacturer marks.
  ctx.fillStyle = '#ffffff88'; ctx.fillRect(size * .08, size * .05, size * .2, size * .012);
  if (number != null) {
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#102033'; ctx.lineWidth = size * .018;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `bold ${size * .52}px Arial`;
    ctx.strokeText(String(number), size / 2, size * .59); ctx.fillText(String(number), size / 2, size * .59);
    if (playerName) {
      ctx.font = `bold ${size * .085}px Arial`;
      const text = Array.from(playerName.toLocaleUpperCase('tr')).slice(0, 14).join('');
      ctx.strokeText(text, size / 2, size * .2, size * .86); ctx.fillText(text, size / 2, size * .2, size * .86);
    }
  }
}
export function drawKitPreview(canvas, kit) {
  const ctx = canvas.getContext('2d'); const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (!kit) return;
  ctx.save(); ctx.translate(w * .18, h * .05); const s = w * .64;
  ctx.beginPath(); ctx.moveTo(s * .24, 0); ctx.lineTo(0, s * .15); ctx.lineTo(s * .11, s * .4);
  ctx.lineTo(s * .23, s * .32); ctx.lineTo(s * .23, s * .88); ctx.lineTo(s * .77, s * .88);
  ctx.lineTo(s * .77, s * .32); ctx.lineTo(s * .89, s * .4); ctx.lineTo(s, s * .15);
  ctx.lineTo(s * .76, 0); ctx.lineTo(s * .61, .06 * s); ctx.lineTo(s * .39, s * .06); ctx.closePath();
  ctx.clip(); drawKitFabric(ctx, s, kit); ctx.restore();
  ctx.fillStyle = kit.shortsColor; ctx.fillRect(w * .33, h * .69, w * .15, h * .15); ctx.fillRect(w * .52, h * .69, w * .15, h * .15);
  ctx.fillStyle = kit.socksColor; ctx.fillRect(w * .37, h * .89, w * .07, h * .09); ctx.fillRect(w * .56, h * .89, w * .07, h * .09);
}
