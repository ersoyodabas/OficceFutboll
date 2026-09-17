# Lobi Ekranı — Geliştirme Önerileri İçin Bağlam

Bu doküman, "OFFICE FUTBOLL" oyununun **lobi ekranı** hakkında başka bir yapay
zekaya danışmak için hazırlanmıştır. Amaç: sadece lobi ekranıyla ilgili
(deneyim, tasarım, etkileşim, performans) geliştirme önerileri almak.

## Proje özeti

- Manifest V3 Chrome eklentisi + Node.js WebSocket sunucusu üzerinden çalışan,
  tarayıcıda 3D (Three.js) oynanan 5'e 5 ofis içi futbol oyunu.
- İstemci sadece sunucu durumunu gösterir; sunucu lobi, maç, oyuncu hareketi,
  top fiziği, gol ve skor konusunda otoritedir.
- Giriş noktası: [game.html](../game.html) → [src/core/game.js](../src/core/game.js).

## Lobi ekranının rolü

Lobi, maç öncesi bir sunum ekranıdır: iki takımın dizilişi 3D olarak karşılıklı
durur, her oyuncunun altında kendi kartı vardır.

1. Oyuncu, dizilişteki boş bir kartı (ya da onun üstündeki 3D oyuncu alanını)
   tıklayarak takımını ve mevkisini seçer.
2. Takım kaptanı kulüp ve forma seçer; renkler ve sahne ışıkları buna göre değişir.
3. Herkes "HAZIRIM" der; sunucu doğrular ve 5 saniyelik geri sayımı başlatır.
4. Geri sayım biterken ekran maça geçer. Biri hazırlığını geri alır veya
   ayrılırsa sunucu geri sayımı iptal eder.

Lobi ayrıca şunları içerir: profil (isim düzenleme), kulüp/forma diyaloğu,
ayarlar, oyuncu listesi ve sohbet çekmecesi, lobi müziği ve hızlı ses kontrolü.

## İlgili dosyalar

| Dosya | Sorumluluk |
|---|---|
| [game.html](../game.html) | Lobi DOM iskeleti (`#lobbyOverlay` → `.lobby-top`, `#clubSides`, `#lobbySlots`, `.lobby-drawer`, `.lobby-bottom`) |
| [src/ui/lobby.css](../src/ui/lobby.css) | Lobi görsel dili (cam paneller, oyuncu kartları, hazır butonu, geri sayım) |
| [src/lobby/lobby.js](../src/lobby/lobby.js) | Sunucu lobi mesajını ekrana çevirir; katılma, hazır olma, sohbet, menü akışı |
| [src/lobby/lobbyStage.js](../src/lobby/lobbyStage.js) | 3D sahne: ortam, ışıklar, slot platformları, oyuncu modelleri, kamera çerçeveleme |
| [src/lobby/lobbyPoses.js](../src/lobby/lobbyPoses.js) | Lobi duruşları (sakin bekleme, hazır duruşu, kutlama) — saf fonksiyonlar |
| [src/lobby/lobbySlots.js](../src/lobby/lobbySlots.js) | 3D oyuncuların altındaki HTML oyuncu kartları ve hizalanmaları |
| [src/lobby/clubSelector.js](../src/lobby/clubSelector.js) | Takım kimliği kartları ve kulüp/forma diyaloğu |
| [src/lobby/teamAccent.js](../src/lobby/teamAccent.js) | Kulüp renginden sahne vurgu rengi üretir |
| [shared/goalkeeperKit.js](../shared/goalkeeperKit.js) | Her iki takımdan ayrışan özgün kaleci forması seçer |
| [src/gameplay/player.js](../src/gameplay/player.js) | Prosedürel futbolcu modeli (geometri paylaşımlı), forma uygulama, temizleme |
| [src/lobby/profile.js](../src/lobby/profile.js) | Oyuncu adı düzenleme |
| [src/ui/countdown.js](../src/ui/countdown.js) | Maç geri sayımı göstergesi |
| [src/ui/hud.js](../src/ui/hud.js) | Overlay yönetimi, maça geçiş kararması |
| [src/audio/audioManager.js](../src/audio/audioManager.js) | Lobi müziği |
| [server/lobby/](../server/lobby/) | Sunucu tarafı roster, slot seçimi, kulüp/forma, hazır durumu, geri sayım |

## Güncel lobi DOM yapısı (özet)

```html
<div id="lobbyOverlay">
  <div class="lobby-scene">           <!-- 3D sahne bu katmanın arkasında çizilir -->
    <header class="lobby-top">        <!-- OFFICE FUTBOLL + eşleşme + müzik -->
    <div id="clubSides">              <!-- solda ev sahibi, sağda deplasman kimliği -->
    <div id="lobbySlots">             <!-- her slot için 3D oyuncuya hizalı kart butonu -->
    <div class="lobby-centre">VS</div>
    <aside class="lobby-drawer" id="chatPanel">  <!-- oyuncu listesi + sohbet -->
    <footer class="lobby-bottom">     <!-- profil / kulüp-forma / ayarlar / sohbet + HAZIRIM -->
  </div>
</div>
```

## Bilinen kısıtlar / kurallar

- Lobi ekranı sadece **sunucudan gelen durumu gösterir**; kim hazır, kim nerede
  oturur, maç ne zaman başlar kararlarını vermez.
- 3D sahne oyunun **mevcut renderer'ını** kullanır; ikinci bir WebGL bağlamı
  açılmaz. Futbolcu geometrisi tüm örnekler arasında paylaşılır, modeller
  oyuncu kimliğine göre havuzlanır ve oyuncu ayrılınca serbest bırakılır.
- Oyuncu kartları sabit piksel koordinatlarıyla değil, 3D modelin ekrana
  izdüşümüyle konumlanır; pencere boyutu değişince yeniden hizalanır.
- Dar/dikey ekranlarda diziliş iki kat hâline gelir (ev sahibi üstte).
- Tasarım dili: koyu, sinematik, naneyeşili vurgu; Türkçe arayüz metni.
- Ses/müzik `preferences.lobbyMusicEnabled` ve `preferences.lobbyMusicVolume`
  ile kontrol edilir.

## İstenen öneri türleri

Lütfen aşağıdaki başlıklarda somut, uygulanabilir öneriler üret:
- Kullanıcı deneyimi / etkileşim akışı (yer seçme, hazır olma, davet etme)
- Görsel tasarım ve düzen (mevcut CSS/DOM yapısına uygun, aşırı yeniden yazım gerektirmeyen)
- Erişilebilirlik (klavye/ekran okuyucu — mevcut `aria-*` kullanımını genişletmek)
- Performans (özellikle düşük güçlü cihazlarda 3D sahne render'ı)
- Sosyal/oyun içi motivasyon (takım dengesi, bekleme süresini eğlenceli kılma vb.)

Sunucu tarafı oyun kurallarını veya maç içi mekanikleri **kapsam dışı** tut;
sadece lobi ekranı deneyimine odaklan.
