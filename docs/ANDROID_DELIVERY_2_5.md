# My Finance 2.5 Android teslimi

Bu sürümün paket kimliği `com.faraday.followfinance`, Android sürüm kodu `25`, sürüm adı `2.5.0` olarak korunmuştur. Minimum Android sürümü 7.0 (API 24), hedef sürüm API 36'dır.

## İmza uyumluluğu

7 Kasım 2026 incelemesinde bağlı Samsung Galaxy A35 (`SM-A356E`, Android 16 / API 36) üzerinde kurulu 2.4.0 APK doğrudan cihazdan okunmuştur. Bu APK'nın imzası, yerel release anahtarıyla üretilen 2.4.0 APK ile aynıdır:

```text
SHA-256: cd8aa14a4ef80b19f8568640adf41ccc0e7bdf43473381b363f41f942e6e8015
SHA-1:   5a6ca4b0d98e64bf61b850bd2853b9e9c5d047df
```

Eski kurulum hatasının nedeni farklı Android debug ve release sertifikalarıdır. Eski WSL debug anahtarı da bulunmuş ve önceki kurulu APK'nın sertifikasıyla eşleştiği doğrulanmıştır; ancak bu inceleme sırasında telefonda artık release imzalı 2.4.0 vardır. Bu nedenle 2.5.0 için aynı release anahtarı kullanılır. Google servisleri Android yapılandırmasında bu release SHA-1 değeri kayıtlıdır. Bu yerel yapılandırma denetimi, kullanıcıyla Google girişinin başarıyla tamamlandığı anlamına gelmez.

Uygulamayı kaldırmak veya verilerini temizlemek güncelleme adımı değildir. `INSTALL_FAILED_UPDATE_INCOMPATIBLE` tekrar görülürse, önce kurulu APK'nın sertifikasını ve varsa yedeği kontrol edin. Anahtarlar ve parolalar APK veya Git deposuna dahil edilmez.

## Yeniden üretme ve doğrulama

Windows üzerinde JDK 21, Android SDK 36 ve Node.js gerekir. Mevcut `frontend/android/keystore.properties` yerel imza anahtarını göstermelidir.

```powershell
cd frontend
.\scripts\build-android.ps1
```

Komut web derlemesini üretir, Capacitor Android kopyasını günceller, release APK oluşturur ve `artifacts/my-finance-2.5.0-android-release.apk` dosyasına kopyalar. Ardından:

- APK imzasını Android `apksigner` ile doğrular.
- Release sertifikasını yukarıdaki SHA-256 değeriyle karşılaştırır; farklı anahtarla teslimi durdurur.
- Paket kimliğini ve Android / frontend sürüm eşleşmesini denetler.
- `frontend/dist` içindeki her dosyanın APK içindeki `assets/public` kopyasını SHA-256 düzeyinde karşılaştırır.
- Native Google Authentication, Analytics, Push Notifications ve Local Notifications plugin kayıtlarını denetler; `com.google.android.gms.permission.AD_ID` ve kesin alarm izinlerinin eklenmesini reddeder.
- APK'nın yanına SHA-256 ve makine tarafından okunabilir `.verification.json` raporu yazar.

Mevcut APK'yı yeniden denetlemek için:

```powershell
.\frontend\scripts\verify-android.ps1 `
  -Apk artifacts/my-finance-2.5.0-android-release.apk `
  -Dist frontend/dist `
  -ExpectedVersion 2.5.0 `
  -ExpectedCertificateSha256 cd8aa14a4ef80b19f8568640adf41ccc0e7bdf43473381b363f41f942e6e8015
```

Doğrulama komutunun yanlış sertifikayı reddetme davranışı ve önceki 2.4.0 APK'nın 38 web dosyasıyla eşleşmesi kontrol edilmiştir.

## Native yapılandırma

Uygulama açılış zemini aydınlık temada `#f7f8fa`, sistem karanlık temada `#111619` olarak eşlenmiştir. Analytics toplama, reklam kimliği toplama ve otomatik ekran raporlama Android manifestinde varsayılan olarak kapalıdır. FCM bildirimleri `finance-push-v1` kanalını ve beyaz durum çubuğu simgesini kullanır. Uygulama kesin alarm erişimi istemez.

## Cihaz kabul sınırları

APK imzası ve paket doğrulaması; Google hesap seçimi, Firestore senkronizasyonu veya gerçek FCM tesliminin yerine geçmez. Paylaşmadan önce cihazda ilk açılış, gelir/gider girişi, kart oluşturma, Google hesap seçimi, senkronizasyon, bildirim izni, arka planda bildirim teslimi ve bildirimden uygulamaya dönüş ayrı ayrı kontrol edilmelidir. Giriş için kullanıcı hesap seçimini kendisi yapmalıdır.

## Teslim edilen dosya

- APK: `artifacts/my-finance-2.5.0-android-release.apk`
- Boyut: 7.655.538 bayt (yaklaşık 7,7 MB).
- SHA-256: `c6e83fb6b9f0761ba8f8defc098bf003eef63ad4dadb18f1be50605e96ae2998`.
- Android release derlemesi başarılıdır; paket sürümü `25 / 2.5.0`, minimum API `24`, hedef API `36` olarak doğrulanmıştır.
- İmza, yukarıdaki mevcut release sertifikasıyla eşleşmiştir. Final web derlemesindeki 41 dosyanın tamamı APK içeriğiyle hash düzeyinde eşleşmiştir; yedi native plugin pakette mevcuttur.
- Son APK, canlı FCM zamanlayıcı bağlantısı açık ve Analytics ölçüm kimliği `G-HW2T09THRX` tanımlı web derlemesini içerir. Web giriş dosyası `index-KTu9VyRk.js`, stil dosyası `index-BLjSRH5-.css` olarak paketlenmiştir.
- Raporlar APK'nın yanındaki `.sha256` ve `.verification.json` dosyalarındadır.
- Kullanıcının testleri kendisinin yapma talimatı üzerine cihaz/emülatör kurulum ve çalışma testleri yapılmamıştır. A35 uygulaması kaldırılmamış, cihaz verileri ve izin tercihleri değiştirilmemiştir.

Android imza davranışının kaynağı: [Android Developers — Sign your app](https://developer.android.com/studio/publish/app-signing). Doğrulama aracının kaynağı: [Android Developers — apksigner](https://developer.android.com/tools/apksigner).
