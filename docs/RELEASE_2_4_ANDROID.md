# My Finance 2.4 Android

7 Kasım 2026 tarihli yerel test sürümü. Android paket kimliği `com.faraday.followfinance`; sürüm `2.4.0`, sürüm kodu `24`; minimum Android sürümü 7.0 (API 24).

## Kullanıcı deneyimi

- Dört adımlı, geri dönülebilen ve atlanabilen ilk kurulum: karşılama, kart, gelir, hatırlatma.
- Ana ekranda kaydedilen gelir, net gider ve gelirden kalan. Kalan tutar banka bakiyesi olarak sunulmaz. Gelir/gider ekleme ve Kartlarım kısa yolları görünür.
- Akbank ve Garanti BBVA için birden fazla kart. Kart başına kesim günü, aylık veri giriş günü, isteğe bağlı son dört hane ve hatırlatma tercihi.
- Kart seçerek ekstre yükleme. Aynı bankadaki farklı kartlar ayrı işlem kimlikleri kullanır. Eski ekstreler tutarları değiştirilmeden karta bağlanabilir.
- Kart kaldırıldığında ekstre ve hareketler korunur; kaldırılan kart aynı kimlikle geri eklenebilir. Ad değişikliği aktif filtreyi günceller.
- Android ekstre ve kayıt hatırlatmaları: açık izin isteği, saat seçimi, test bildirimi, kısa aylar için ay sonuna taşıma. Aynı güne gelen iki hatırlatma birleştirilir.
- Uygulamaya dönüşte mevcut geçerli bildirimler korunur; Android'in geciktirdiği alarm yenileme sırasında silinmez. Kartı kaldırma veya hatırlatmayı kapatma ilgili planı iptal eder.
- Bildirime dokunma PIN sonrasına kadar saklanır ve Kartlarım bölümüne götürür. Android geri tuşu önce en üst paneli kapatır; kurulumda önceki adıma döner.

## Doğrulananlar

- `npm.cmd test -- --maxWorkers=4 --minWorkers=1`: 32 dosyada 420 test geçti.
- Kart kimliği, kısa aylar, kaldırıp geri ekleme, filtre adı değişimi, yedekleme, eski veri geçişi ve senkronizasyon sınırları test edildi.
- Bildirim testleri izin, saat değişikliği, kapatma/silme, ay sonu, geciken alarm, seri planlama, hata sonrası tekrar deneme ve PIN sonrasına saklanan dokunuşu kapsar.
- Tarayıcıda ilk kurulum, hatalı gelir tutarının reddi, 45.000 TL gelir ve 15.000 TL kira sonrası 30.000 TL kalan, Akbank/Garanti kart ekleme ve yeniden açılışta verilerin korunması kontrol edildi.
- Üretim önizlemesinin ilk açılış ve kurulumu atlama akışında sıfır konsol hatası görüldü. Mobil ve masaüstü görünümleri sentetik verilerle görsel olarak kontrol edildi.
- Tasarım denetleyicisi değişen ana arayüz dosyalarında bulgu döndürmedi.

## Cihazda tamamlanacak kabul turu

Bu bilgisayarda bağlı Android cihaz veya hazır emülatör yoktu. APK'nın telefona kurulması, bildirim izni, arka planda gerçek teslim, cihaz yeniden başlatma, Android geri tuşu ve PIN sonrası bildirime dokunma fiziksel cihazda doğrulanmış değildir. Gerçek banka hesabıyla giriş/senkronizasyon da bu turda sınanmadı.

Hatırlatmalar Android cihazında yerel olarak planlanır. Bu sürüm uzaktan FCM push göndermez. Uygulama açılışında ve dönüşte önümüzdeki 12 ayın planı yenilenir; internet veya sunucu gerekmez. Teslim yaklaşık saatte gerçekleşir ve Android pil/kanal ayarlarından etkilenebilir.

[APK kurulum ve test adımları](APK_TESTING.md).

## Son web paketi

`npm.cmd run build` tip kontrolüyle birlikte başarılı tamamlandı. Son üretim paketinin giriş dosyası `index-BNadNz__.js`, stil dosyası `index-7Wd-irrL.css` olarak üretildi. Bu paket geciken alarmı koruma düzeltmesini içerir. Üretim önizlemesinde örnek bütçeden gerçek gelir girişine geçiş ve yeniden açılış sınandı: sıfır JavaScript/konsol hatası, örnek kayıtların kalıcı veriye karışmaması doğrulandı. 320px genişlikte belge genişliği de 320px ölçüldü; yatay taşma görülmedi.

## Teslim edilen APK

- Dosya: `artifacts/my-finance-2.4.0-android-release.apk`
- Boyut: 5.550.246 bayt (yaklaşık 5,6 MB).
- İmzalı release build başarıyla üretildi. `apksigner verify` geçti; APK Signature Scheme v2 doğrulandı.
- `aapt` paket kontrolü: `com.faraday.followfinance`, sürüm adı `2.4.0`, sürüm kodu `24`, minimum API `24`, hedef API `36`.
- Son `frontend/dist` içindeki 38 dosyanın tamamı APK içindeki `assets/public` kopyalarıyla bayt/SHA-256 düzeyinde eşleşti; uyuşmazlık yok.
- Bildirim izni ve yeniden başlatma sonrası planı yükleyen receiver APK manifestinde mevcut; kesin alarm ayrıcalığı yok. LocalNotifications plugin kaydı pakette doğrulandı.
- SHA-256: `773bcb8518b4539367fbafda953e36ec6a5d35ca93e916d4278a73c903723d9a`
- Makine tarafından okunabilir rapor: `artifacts/my-finance-2.4.0-android-release.verification.json`

Canlı web dağıtımı veya uygulama mağazasına gönderim yapılmadı. İmza anahtarı ve parolalar APK teslimine dahil edilmedi.
