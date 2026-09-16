# Lobi Ekranı — Geliştirme Önerileri İçin Bağlam

Bu doküman, "Ofis Futbolu 3D" oyununun **lobi ekranı** hakkında başka bir yapay
zekaya danışmak için hazırlanmıştır. Amaç: sadece lobi ekranıyla ilgili
(deneyim, tasarım, etkileşim, performans) geliştirme önerileri almak.

## Proje özeti

- Manifest V3 Chrome eklentisi + Node.js WebSocket sunucusu üzerinden çalışan,
  tarayıcıda 3D (Three.js) oynanan 5'e 5 ofis içi futbol oyunu.
- İstemci sadece sunucu durumunu gösterir; sunucu lobi, maç, oyuncu hareketi,
  top fiziği, gol ve skor konusunda otoritedir.
- Giriş noktası: [game.html](../game.html) → [src/core/game.js](../src/core/game.js).

## Lobi ekranının rolü

Oyuncular sunucuya bağlandıktan sonra lobi ekranında:
1. 3D sahada boş bir yere (mavi/kırmızı takım, 5 pozisyon) tıklayıp yer seçer.
2. "HAZIRIM" butonuna basarak hazır olduğunu bildirir.
3. Herkes hazır olunca sunucu geri sayım başlatır ve maça geçilir.
4. Maç bitince veya erken çıkılınca tekrar lobiye dönülür.

Lobi ekranı ayrıca şunları içerir: arkadaş davet linki kopyalama, lobi müziği
(otomatik başlar/durur + hızlı ses düzeyi kontrolü), ayarlar paneli (genel ses,
lobi müziği açık/kapalı ve seviyesi, tuş atamaları).

## İlgili dosyalar

| Dosya | Sorumluluk |
|---|---|
| [game.html](../game.html) | Lobi DOM yapısı (`#lobbyOverlay` içinde `.lobby-header`, `.pitch-panel`, `.lobby-footer`) |
| [src/ui/styles.css](../src/ui/styles.css) | Lobi görsel stili (`.lobby-shell`, `.pitch-panel`, `.pitch-slot`, `.lobby-footer` vb.) |
| [src/lobby/lobby.js](../src/lobby/lobby.js) | Lobi durumunu sunucu mesajlarından render eder, katılma/hazır olma akışı |
| [src/lobby/lobbyView.js](../src/lobby/lobbyView.js) | Lobideki mini 3D saha görünümü (Three.js ortografik kamera, oyuncu modelleri, slot butonları) |
| [src/lobby/invitation.js](../src/lobby/invitation.js) | Davet linki oluşturma/kopyalama, URL parametreleriyle otomatik katılım |
| [src/ui/hud.js](../src/ui/hud.js) | Genel overlay yönetimi, lobi/maç/ayarlar geçişleri |
| [src/ui/settings.js](../src/ui/settings.js) | Ayarlar panelinin (ses, tuşlar) mantığı |
| [src/audio/audioManager.js](../src/audio/audioManager.js) | Lobi müziği (mp3) oynatma, lobiye girince başlatma/çıkınca durdurma |
| [src/core/preferences.js](../src/core/preferences.js) | localStorage'da tutulan kullanıcı tercihleri (ses seviyeleri, tuşlar) |
| [server/lobby/](../server/lobby/) | Sunucu tarafı roster, slot seçimi, hazır durumu, geri sayım mantığı |

## Güncel lobi DOM yapısı (özet)

```html
<div id="lobbyOverlay">
  <div class="lobby-shell">
    <header class="lobby-header">
      <!-- başlık + kısa açıklama -->
      <div class="invite-area">
        <!-- davet linki kopyalama, hızlı müzik ses kontrolü, ayarlar butonu -->
      </div>
    </header>
    <section class="pitch-panel">
      <!-- takım başlıkları + oyuncu sayacı -->
      <div id="lobbyPitch"><div id="pitchSlots"></div></div> <!-- 3D mini saha -->
      <!-- lejant: boş yer / sarı halka sensin / hazır -->
    </section>
    <p id="slotStatus"></p>
    <footer class="lobby-footer">
      <!-- profil avatarı + isim/rol, hazır ilerleme çubuğu, HAZIRIM butonu -->
    </footer>
  </div>
</div>
```

## Bilinen kısıtlar / kurallar

- Lobi ekranı sadece **sunucudan gelen durumu gösterir**; oyun mantığına
  (kim hazır, kim nereye oturur, maç ne zaman başlar) karar vermez.
- Yeni gecikme/etkileşim eklerken sunucu mesaj akışını (`SERVER.LOBBY`,
  `SERVER.LOBBY_RETURNED`, `SERVER.COUNTDOWN_START` vb.) bozmamak gerekir.
- Tasarım dili: koyu/futbol sahası temalı (lacivert/yeşil tonlar), Türkçe arayüz metni.
- Mobil/dar ekran için `@media (max-width: 700px)` kırılım noktaları zaten var.
- Ses/müzik: `preferences.lobbyMusicEnabled` ve `preferences.lobbyMusicVolume`
  ile kontrol edilir; hem ayarlar panelinde hem lobi başlığında hızlı kontrol var.

## İstenen öneri türleri

Lütfen aşağıdaki başlıklarda somut, uygulanabilir öneriler üret:
- Kullanıcı deneyimi / etkileşim akışı (yer seçme, hazır olma, davet etme)
- Görsel tasarım ve düzen (mevcut CSS/DOM yapısına uygun, aşırı yeniden yazım gerektirmeyen)
- Erişilebilirlik (klavye/ekran okuyucu — mevcut `aria-*` kullanımını genişletmek)
- Performans (özellikle mobil/düşük güçlü cihazlarda 3D mini saha render'ı)
- Sosyal/oyun içi motivasyon (takım dengesi, bekleme süresini eğlenceli kılma vb.)

Sunucu tarafı oyun kurallarını veya maç içi mekanikleri **kapsam dışı** tut;
sadece lobi ekranı deneyimine odaklan.
