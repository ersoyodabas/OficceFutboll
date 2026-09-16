export function createInvitationHandler({ state, getLanIPv4Addresses, getPort }) {
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Invitees use the same game.html/game.js lobby as extension users, served
// from this LAN server because unpacked extension IDs differ between machines.
function handleJoinLanding(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const fromName = url.searchParams.get('from');
  const lanIp = getLanIPv4Addresses()[0];
  const serverUrl = url.searchParams.get('server') || (lanIp ? `ws://${lanIp}:${getPort()}` : `ws://localhost:${getPort()}`);
  const safeServerUrl = escapeHtml(serverUrl);
  const safeFromName = escapeHtml(fromName || '');

  const matchInProgress = state.phase === 'playing';
  const statusLine = matchInProgress
    ? 'Maç şu anda devam ediyor. Bittiğinde otomatik olarak lobiye alınacaksın.'
    : (fromName
      ? `<strong>${escapeHtml(fromName)}</strong> seni Office Futboll maçına davet etti.`
      : 'Office Futboll maçına davet edildin.');

  const html = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Office Futboll'a Katıl</title></head>
<body style="margin:0; padding:24px; background:#10151c; color:#e8ebef; font-family:Arial, Helvetica, sans-serif;">
  <div style="max-width:420px; margin:0 auto; background:#161d26; border-radius:10px; overflow:hidden;">
    <div style="background:#12321f; padding:26px 24px; text-align:center;">
      <div style="font-size:12px; letter-spacing:2px; color:#5ce87a; font-weight:bold;">⚽ OFFICE FUTBOLL</div>
      <div style="font-size:22px; font-weight:bold; margin-top:10px;">Maça davet edildiniz!</div>
    </div>
    <div style="padding:24px; font-size:14px; line-height:1.6; text-align:center;">
      <p>${statusLine}</p>

      <form action="/game.html" method="get" onsubmit="console.log('[JOIN] Invite button clicked'); document.getElementById('joinBtn').textContent='KATILIYOR...';">
        <input type="hidden" name="server" value="${safeServerUrl}">
        <input type="hidden" name="from" value="${safeFromName}">
        <input type="hidden" name="join" value="1">
        <label for="playerName" style="display:block;text-align:left;">Adın</label>
        <input id="playerName" name="name" type="text" maxlength="20" required autocomplete="name" placeholder="Adını yaz" style="box-sizing:border-box;width:100%;padding:12px;margin:6px 0;border-radius:8px;border:1px solid #6b7684;background:#0f141b;color:#fff;">
        <button id="joinBtn" type="submit" style="display:inline-block; width:100%; padding:16px 24px; margin:18px 0 8px; font-size:17px; font-weight:bold;
        color:#ffffff; background:#3ea45f; border:none; border-radius:8px; cursor:pointer;">
        ⚽ KATIL
        </button>
      </form>

      <p style="color:#9aa5b1; font-size:12px; text-transform:uppercase; margin-bottom:4px; text-align:left;">Sunucu adresi</p>
      <div style="background:#0f141b; border-radius:8px; padding:12px 14px; color:#5ce87a; font-family:Consolas, 'Courier New', monospace; font-size:15px; text-align:left;">${safeServerUrl}</div>

      <p style="color:#9aa5b1; font-size:13px; margin-top:18px; text-align:left;">Katıldıktan sonra lobide takımını ve mevkini seçip HAZIR'a bas.</p>
      <p style="color:#6b7684; font-size:12px; margin-top:14px;">
        Bu adrese ulaşamıyorsan şirket ağına veya VPN'e bağlı olduğundan emin ol.
      </p>
    </div>
  </div>
</body></html>`;

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

return { handleJoinLanding };
}
