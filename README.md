# Ofis Futbolu 3D

Şirket içi ağdan çok oyunculu, 3 boyutlu (Three.js + cannon-es) bir ofis futbolu oyunu.
İstemci bir Chrome uzantısı (Manifest V3), sunucu ise LAN üzerinde çalışan bir Node.js
WebSocket sunucusudur.

## Proje yapısı

```
manifest.json       Chrome uzantısı (Manifest V3) tanımı
background.js        Araç çubuğu ikonuna tıklanınca game.html'i yeni sekmede açar
game.html / game.js   Lobi, takım/mevki seçimi, davet linki, 3D oyun sahnesi ve ağ istemcisi
field.js             İstemci ve sunucunun ortak saha/kale ölçüleri (48 × 76 oyun birimi)
stadium.js           Statik tribünler, seyirci, reklam, çevre ve teknik alan
assets/textures/pitch/ Yerel çim diffuse ve normal dokuları
lib/three.min.js      Yerel Three.js (CDN kullanılmaz — MV3 uyumluluğu için)
server/                LAN sunucusu (Node.js, ws + cannon-es + /join davet sayfası)
```

## Uzantıyı yükleme

1. `chrome://extensions` adresine git.
2. Sağ üstten **Geliştirici modu**'nu aç.
3. **Paketlenmemiş öğe yükle**'ye tıkla ve bu klasörü (proje kökünü) seç.
4. Araç çubuğundaki ikona tıkla — oyun yeni sekmede açılır.

## Maç kontrolleri

Maç sırasında yalnızca **ok tuşları** oyuncuyu ekrandaki kendi yönlerinde hareket
ettirir; çapraz yönler aynı toplam hıza normalize edilir. **W** bir yönle birlikte sprinttir. Top sendeyken **A** yerden pas,
**S** şut, **D** havadan ortadır. Top sende değilken **A** pas yapmaz, **S** ayakta
müdahale, **D** kayarak müdahaledir. Top sahipliğini ve eylem bekleme sürelerini
sunucu belirler. Lobi alanlarına yazı yazarken oyun tuşları girişe karışmaz.

Lobide tek oyuncu da **HAZIR** diyerek 5 saniyelik geri sayımı ve maçı başlatabilir.

Maç sırasında **ESC** veya **Menü** düğmesi, ekranın ortasında oyun menüsünü açar.
**Oyuna devam et** ya da tekrar **ESC** menüyü kapatır. Menü açıkken oyuncunun
kontrolleri durur; çevrim içi maç devam eder. **Maçtan çık · Lobiye dön** bağlantıyı
kesmeden oyuncuyu sahadan çıkarır. Diğer oyuncular maçlarına devam eder; çıkan
oyuncu lobide takımını ve mevkini seçip sonraki maçı bekleyebilir. Son oyuncu da
çıkarsa maç sıfırlanır ve herkes lobide yeniden hazır olabilir.

Lobide kişisel oyuncu kartı, iki takımın kadroları ve maç hazırlık alanı ayrıdır.
Kadrolarda mevki, yönetici, kendi oyuncun ve hazır/sahada durumları gösterilir.

Yayın kamerası her karede doğrudan topun çizilen konumuna odaklanır ve top boyunca
hareket eder. Kaleler, saha ölçeğine göre gerçek 7,32 × 2,44 metre oranındadır.

## Sunucuyu çalıştırma

```bash
cd server
npm install
npm start
```

Sunucu başladığında hem `localhost` hem de tespit edilen LAN IP adreslerini yazdırır,
örneğin:

```
========================================
 OFFICE FUTBOLL SERVER
========================================
Local:
  ws://localhost:3000

LAN:
  ws://10.17.12.93:3000

Port: 3000

Waiting for players...
========================================
```

Sunucu `0.0.0.0` üzerinde dinler (sadece `localhost` değil), yani aynı ağdaki başka
bilgisayarlar da bağlanabilir. Uzantıdaki sunucu adresi alanı varsayılan olarak
`ws://10.17.12.93:3000` ile doldurulur; farklı bir makinede farklı bir IP kullanılıyorsa
bu alanı elle değiştirebilirsin — bir kez başarıyla bağlandığında o adres hatırlanır ve
bir sonraki açılışta otomatik doldurulur.

## LAN Multiplayer Setup

Sunucuyu kendi bilgisayarında (Windows) barındırıp ofis ağındaki diğer bilgisayarların
bağlanmasını istiyorsan aşağıdaki adımları izle.

### 1. Windows Güvenlik Duvarı kuralı ekle

Sunucuyu ilk kez başlatmadan önce (veya bağlantı sorunları yaşarsan), **Yönetici olarak**
açılmış bir PowerShell'de:

```powershell
New-NetFirewallRule `
  -DisplayName "Office Futboll WebSocket" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 3000 `
  -Action Allow
```

Bu kural, 3000 portuna gelen bağlantılara Windows Güvenlik Duvarı'nın izin vermesini
sağlar. Farklı bir port kullanıyorsan (`PORT=4000 npm start` gibi) `-LocalPort` değerini
buna göre değiştir.

### 2. Sunucunun doğru dinlediğini doğrula

Sunucuyu çalıştırdığın bilgisayarda:

```powershell
netstat -ano | findstr :3000
```

Beklenen çıktı, `127.0.0.1` değil `0.0.0.0` ile başlamalı:

```
TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       <PID>
```

### 3. Başka bir bilgisayardan bağlantıyı test et

Ofis ağındaki başka bir Windows bilgisayardan (aynı sunucu IP'sini kullanarak):

```powershell
Test-NetConnection 10.17.12.93 -Port 3000
```

Beklenen sonuç:

```
TcpTestSucceeded : True
```

`False` dönerse sırasıyla kontrol et: (a) sunucu gerçekten çalışıyor mu, (b) 1. adımdaki
güvenlik duvarı kuralı eklendi mi, (c) her iki bilgisayar da aynı ağda/subnette mi
(örn. `255.255.254.0` alt ağı), (d) şirket ağında istemciler arası trafiği engelleyen
ek bir güvenlik politikası (AP isolation, VLAN segmentasyonu) olup olmadığı IT ile
teyit edilmeli.

### 4. Chrome uzantısından bağlan

`Test-NetConnection` başarılı olduktan sonra, diğer bilgisayarlarda uzantıyı açıp lobi
ekranında sunucu adresi olarak şunu kullan (uzantı bunu zaten varsayılan olarak dolduracak):

```
ws://10.17.12.93:3000
```

İsim gir, takım ve mevki seç, **Lobiye Katıl**'a bas. Lobiyi ilk açan kişi (host, 👑
rozetiyle görünür) her iki takımda da en az bir oyuncu olduğunda **Maçı Başlat**'a basarak
maçı başlatır.

## Davet Linki

Lobide **"🔗 Davet Linki Kopyala"** butonu, bir iş arkadaşını maça davet etmek için
paylaşılabilir bir bağlantı üretip panoya kopyalar. E-posta/SMTP gönderimi yoktur —
link Slack, Teams, WhatsApp gibi herhangi bir kanalda paylaşılabilir.

Link tamamen istemci tarafında, o an lobide kullanılan sunucu adresinden üretilir:

```
http://<lan-ip>:<port>/join?server=ws%3A%2F%2F<lan-ip>%3A<port>&from=<adın>
```

`GET /join`, sunucunun WebSocket ile aynı portta sunduğu davet ekranıdır. Alıcı adını
yazıp **KATIL** dediğinde sunucunun sunduğu mevcut `game.html` istemcisi açılır;
WebSocket katılımı onaylandıktan sonra aynı lobi görünür. Alıcı takımını ve mevkini
lobide seçip **HAZIR** diyebilir. Bu yol, farklı kurulumların uzantı kimliklerine bağlı
değildir; elle bağlanan uzantı kullanıcılarıyla aynı sunucu ve lobi akışını kullanır.

## Notlar

- Fizik (topa ivmeli vuruş, sekmeler) sunucuda cannon-es ile hesaplanır; istemciler
  sadece pozisyonları alıp yumuşatarak (interpolasyon) çizer, bu yüzden herkes aynı maçı
  görür.
- Uzantı, harici bir CDN'den değil yalnızca yerel `lib/three.min.js` dosyasından Three.js
  yükler (Manifest V3 uyumluluğu ve uzak kod çalıştırmama ilkesi gereği).
- Sunucu IP'si (`10.17.12.93`) koda gömülü değildir — sadece istemcinin varsayılan alan
  değeri olarak kullanılır ve `os.networkInterfaces()` ile otomatik tespit edilir; DHCP IP
  değişse bile sunucu başlatıldığında güncel adresi banner'da gösterir.
