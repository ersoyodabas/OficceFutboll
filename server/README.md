# Ofis Futbolu 3D — Sunucu

Bu klasör, "Ofis Futbolu 3D" Chrome eklentisi için gereken LAN (şirket içi ağ) lobi ve maç
sunucusudur. Sunucu WebSocket üzerinden bağlanan oyuncuları otomatik olarak Mavi/Kırmızı
takımlara ayırır, fizik simülasyonunu (cannon-es) çalıştırır ve maç durumunu tüm istemcilere
yayınlar.

## Kurulum

Node.js 18+ gerekir (bu ortamda Node 24 ile test edildi).

```bash
cd server
npm install
npm start
```

Varsayılan port **3000**'dir. Farklı bir port kullanmak için:

```bash
PORT=4000 npm start
```

(Windows PowerShell: `$env:PORT=4000; npm start`)

## Diğer bilgisayarların bağlanması

1. Sunucuyu çalıştıran bilgisayarın LAN IP adresini öğrenin: `ipconfig` (Windows) çıktısında
   "IPv4 Address" (örn. `192.168.1.50`).
2. Aynı ofis ağındaki herkes, Chrome eklentisindeki lobi ekranına bu adresi
   `192.168.1.50:3000` şeklinde girip "Bağlan" demeli.
3. Windows Güvenlik Duvarı ilk çalıştırmada Node.js için ağ erişimine izin istemi
   gösterebilir — "İzin Ver" (Özel ağlar) seçilmelidir, aksi halde diğer bilgisayarlar
   bağlanamaz.

## Nasıl çalışır

- Sunucuyu ilk çalıştıran / lobiye ilk katılan kişi otomatik olarak **lobi kurucusu (host)**
  olur (👑 rozetiyle görünür). Host ayrılırsa bir sonraki oyuncu otomatik host olur.
- Katılan her oyuncu kendi takımını (Mavi/Kırmızı) ve mevkini (KL, STP, SLB, SGB, DOS,
  OOS, SLK, SGK, FRV) kendisi seçer; lobide iken bunları istediği zaman değiştirebilir.
- Sadece **host** başka oyuncuların takımını değiştirebilir (lobideki "→ Kırmızı/Mavi"
  butonu) — ama maçı **başlatmaz**. Maç, host'un bir butona basmasıyla değil, **herkesin
  HAZIR olmasıyla** otomatik başlar (bkz. "Hazır sistemi ve otomatik başlangıç" aşağıda).
- Seçilen mevki, sahadaki başlangıç konumunu ve o oyuncunun ne kadar ileri/geri ve
  sağa/sola hareket edebileceğini belirler (örn. Sol Kanat sahanın sol tarafında kalır,
  Kaleci kale çizgisine yakın durur).
- Fizik: top gerçek bir cannon-es rigid-body'dir (yerçekimi, zemin/duvar sekmesi, sürtünme).
  Oyuncu-top teması sunucuda sınırlı/öngörülebilir vektör matematiğiyle çözülür (bkz.
  `resolvePlayerBallContact` — cannon-es'in genel çarpışma çözücüsüne bırakmak, hızlı bir
  oyuncunun topu her karede yeniden delip geçmesi yüzünden enerji birikip topun sınırsız
  yükselmesine yol açıyordu). İstemciler sadece pozisyonları alıp yumuşatarak çizer.
- Saha ölçüleri `shared/field.js` dosyasıyla istemci ve sunucu arasında
  paylaşılır (X genişlik 48, Z uzunluk 76). Sunucu top sahipliğini mesafe ve
  fizik durumundan belirler; A/S/D eylemlerini buna göre pas/şut/orta veya ayakta/
  kayarak müdahale olarak işler. Bekleme süreleri ve sprint hızı sunucuda uygulanır.
- Kale genişliği ve yüksekliği gerçek 7,32 × 2,44 metre oranından saha ölçeğine
  çevrilir. Sunucudaki fiziksel üst direk ve yükseklik kontrolü, üst direkten geçen
  yüksek topların gol sayılmasını engeller.
- Maç, ilk 5 golü atan takım kazandığında **veya** `MATCH_DURATION_SECONDS` (varsayılan 300s
  / 5 dk) dolduğunda biter; kısa bir sonuç ekranının ardından herkes lobiye döner ve hazır
  durumu sıfırlanır.

## Hazır sistemi ve otomatik başlangıç

- Lobideki **"HAZIR"** butonuna basan her oyuncunun durumu sunucuda tutulur ve anında tüm
  istemcilere yayınlanır (✓ HAZIR / Bekleniyor…). Takım veya mevki değiştirmek hazır
  durumunu sıfırlar (eski seçim için verilmiş bir onay artık geçerli sayılmaz).
- Sunucu şu koşul sağlandığında **otomatik olarak** 3 saniyelik senkronize bir geri sayım
  başlatır (`MIN_PLAYERS_TO_START`, varsayılan **1** — tek oyunculu antrenman ve çok
  oyunculu maç aynı hazır akışını kullanır):
  ```
  bağlı oyuncu sayısı >= MIN_PLAYERS_TO_START  VE  herkes ready === true
  ```
- Geri sayım, her istemciye aynı mutlak zaman damgasını (`startAt` + `duration`) taşıyan
  tek seferlik bir `countdownStart` mesajıyla yayınlanır; istemciler kendi yerel geri sayım
  döngüsünü değil bu zaman damgasını render eder — böylece herkesin ekranında aynı anda
  "5, 4, 3, 2, 1" görünür.
- Geri sayım sırasında biri bağlantısını keserse, oyuncu sayısı `MIN_PLAYERS_TO_START`'ın
  altına düşerse **veya** yeni biri lobiye katılırsa, geri sayım iptal edilir
  (`countdownCancelled` yayınlanır), herkesin hazır durumu sıfırlanır ve tekrar HAZIR
  demeleri gerekir. (Yeni katılan biri geri sayımı otomatik olarak geçersiz kılmasın diye
  bilinçli olarak seçilen basit davranış — karmaşık bir "izleyici" sistemi eklenmedi.)
- Maç gerçekten başladığında sunucu, gerçek başlangıç/bitiş zaman damgalarını taşıyan
  tek seferlik bir `matchStart` mesajı yayınlar; bu zaman damgaları ayrıca her periyodik
  `state` mesajında da tekrarlanır, böylece maç sırasında bağlanan/yeniden bağlanan bir
  istemci de (örn. maç zaten başlamışken katılan biri, izleyici gibi maçı görür ama
  kontrol edemez) doğru senkronize saati hemen alır — her istemcinin kendi yerel
  `performance.now()` saatiyle bağımsız bir maç saati başlatması engellenmiş olur.

## Davet linki

Lobideki "🔗 Davet Linki Kopyala" butonu e-posta göndermez — panoya kopyalanan bir link
üretir. `GET /join` davet ekranındaki **KATIL** düğmesi, aynı porttan sunulan mevcut
`game.html` istemcisini açar. Katılım onaylanınca alıcı aynı lobiye girer. Detaylar için
proje kökündeki `README.md` → **Davet Linki** bölümüne
bakın.
