# Mizan 2.9.3 mağaza yayını ve beta testleri

## Mağaza kaydı

- Google Play adı: Mizan
- App Store adı: Mizan: Bütçe ve Ekstre
- Dil: Türkçe
- Kategori: Finans
- Google Play paket adı ve iOS bundle ID: `com.faraday.followfinance`
- Kısa açıklama: Ekstrelerini, kartlarını ve aylık bütçeni tek yerde takip et.
- App Store alt başlığı: Ekstre ve bütçe takibi
- Gizlilik politikası: https://my-finance-webapp-fd.web.app/privacy.html
- Hesap silme ve gizlilik tercihleri: https://my-finance-webapp-fd.web.app/account-deletion.html

## Beta dağıtımı

- Android 2.9.3 (32), Google Play dahili test listesine eklenen hesaplar için aktif. [Dahili teste katıl](https://play.google.com/apps/internaltest/4700975698314725774).
- iOS 2.9.3 (29), [Mizan Dahili Test grubunda](https://appstoreconnect.apple.com/teams/ee7af116-2ddf-4aa6-b87d-782e59792a27/apps/6838442964/testflight/groups/bee7a52f-141a-4a18-ace0-f276a08d23a4/builds) `Testing` durumunda. Grup 1 test kullanıcısı (Apple hesap sahibi) ve 1 build içeriyor. iPhone kurulumu henüz cihazda doğrulanmadı. App Store kaydı `6838442964`.
- Apple'ın şifreleme anketinde PDF okuyucunun standart algoritmaları bildirildi. Bu dahili beta için Fransa dağıtımı seçilmedi. Fransa'da App Store dağıtımı planlandığında şifreleme beyanı yeniden değerlendirilmelidir.
- Ana uygulama `com.faraday.followfinance` ve PDF paylaşım uzantısı `com.faraday.followfinance.share`, `group.com.faraday.followfinance` grubunu kullanır. İki uygulama kimliğinin de Apple Developer'da bu gruba bağlı olması gerekir.

## iOS imzalama ve yükleme

- [Mizan iOS beta iş akışı](https://github.com/FurkanEmircanDursun/my-finance/actions/workflows/mizan-ios-beta.yml), `codex/mizan-beta-2.9.3` dalını derler. `MIZAN_TESTFLIGHT_UPLOAD=true` ve `MIZAN_APPLE_TEAM_ID` depo değişkenleriyle imzalı yükleme işini etkinleştirir.
- [İlk 2.9.3 (32) çalışması](https://github.com/FurkanEmircanDursun/my-finance/actions/runs/45248948970) iOS arşivini üretti. Apple, Developer anahtarına bulut dağıtım imzası yetkisi vermedi.
- Dağıtım imzası için mevcut Apple Distribution sertifikası ve `Mizan App Store 20261123` ile `Mizan Share App Store 20261123` profilleri kullanılır. Sertifika, parolası ve iki profil GitHub Actions Secrets'taki `MIZAN_IOS_DISTRIBUTION_P12`, `MIZAN_IOS_DISTRIBUTION_PASSWORD`, `MIZAN_IOS_APP_PROFILE` ve `MIZAN_IOS_SHARE_PROFILE` girdilerinden okunur. İş, sertifikayı geçici bir anahtar zincirine alır ve profilleri ilgili uygulama kimlikleriyle eşleştirir.
- [Dağıtım sertifikasıyla imzalı yükleme](https://github.com/FurkanEmircanDursun/my-finance/actions/runs/45253878370/attempts/2) başarılı. `ios:sync` içindeki `configure-ios-share.mjs`, bu sürümün iOS build numarasını 29 olarak belirledi. Windows'taki özgün sertifika kopyası korundu. GitHub Actions'taki kopya, macOS anahtar zinciriyle uyumlu PKCS#12 biçiminde aynı sertifikayı içerir.
- `MIZAN_ASC_KEY`, `MIZAN_ASC_KEY_ID`, `MIZAN_ASC_ISSUER_ID`, `MIZAN_FIREBASE_WEB_ENV` ve `MIZAN_FIREBASE_IOS_PLIST` değerleri GitHub Actions Secrets'ta tutulur. App Store Connect'teki anahtar adı `Mizan GitHub TestFlight`, rolü `Developer`. Apple ekip anahtarlarına rol düzeyinde tüm ekip uygulamalarından erişim verir.
- Anahtarın Windows kullanıcı hesabına bağlı DPAPI yedeği `%LOCALAPPDATA%\Mizan\Signing\app-store-connect.dpapi` dosyasında tutulur. Anahtar değiştirilirse GitHub Secrets'taki anahtar ve kimlik değerlerini birlikte güncelle.

## Açıklama

Mizan, gelirlerini ve harcamalarını kaydetmene, kart ekstrelerini incelemene ve bütçeni ay ay takip etmene yardımcı olur.

- Desteklenen Akbank Axess ve Garanti BBVA Bonus PDF ekstrelerini incele. Kaydetmeden önce dönemi, hedef kartı ve işlem sayısını kontrol et.
- Harcamalarını kategoriye ve güne göre karşılaştır. Aylık özet ve analiz ekranlarında değişimleri gör.
- Birden fazla kartı ayrı takip et. Dilersen kesim tarihi için hatırlatma ayarla.
- Yanlış eklenen ekstreyi bağlı işlemleriyle kaldır. Gerekirse silme bildiriminden geri al.

## 2.9.3 beta notları

Ekstreler kaydetmeden önce önizlenir. Aynı dosya tekrar eklenmez. Yanlış ekstreyi ve bağlı işlemlerini silebilir, silmeyi bildirimden geri alabilirsin. Bir ekstreyi güncellemek için Ekstre Detayı’ndan PDF ile düzelt’i seç.

Testte yalnızca sentetik veya kendi ekstrelerini kullan. Dosya önizlemesini, yanlış kart uyarısını, tekrar yüklemeyi, silme ve geri almayı dene. iOS’ta Dosyalar paylaşım menüsünden Mizan’a PDF gönder.

## Google Play görselleri

Yerel klasör `output/playwright/mizan-play-store/`. Ekranlar Mizan’ın mobil web arayüzünden, uygulamanın örnek bütçesiyle alındı.

- `play-icon-512.png` uygulama simgesi.
- `play-feature-1024x500.png` tanıtım görseli. Alternatif metin: Mizan simgesi ve Ekstre ve bütçe takibi başlığı.
- `01-ay-ozeti.png` telefon ekranı. Alternatif metin: Ay Özeti, örnek bütçenin gelirini, net harcamasını ve gelirden kalan tutarı gösterir.
- `02-gunluk-harcamalar.png` telefon ekranı. Alternatif metin: Günlük harcama grafiği ve bütçenin kategori bazında harcama payları.

## 24 Kasım 2026 mağaza durumu

- Apple üçüncü taraf içerik envanteri ve inceleme notu [içerik hakları taslağında](MIZAN_CONTENT_RIGHTS.md) kayıtlı.
- App Store taslağında iki iPhone ve iki iPad ekran görüntüsü kayıtlı. Görseller aynı Mizan arayüzünün mobil ve tablet boyutlarında, Firebase emülatörü ve örnek bütçe ile çekildi. Dosyalar `output/playwright/mizan-app-store/` altında.
- Apple sürüm taslağına build 29, destek bağlantısı, telif, ayrı inceleme hesabı, inceleme irtibat bilgileri ve İngilizce inceleme notları eklendi. App Store içerik derecesi 4+, ilk dağıtım Türkiye ve fiyat ücretsiz. Gizlilik etiketi App Store Connect'te yayımlanmış görünüyor. İncelemeye eklemenin önündeki açık madde üçüncü taraf içerik hakları.
- Google Play mağaza girişi simge, tanıtım grafiği ve iki telefon görseliyle incelemeye hazır. Görsel beyanında simge ve tanıtım grafiği yapay zekâ destekli olarak etiketlendi. Finans kategorisi, 18+ hedef kitle, resmî kurum ve sağlık beyanları, inceleme hesabı ve veri güvenliği kaydedildi. Yüklenen veri güvenliği dosyası `output/playwright/mizan-play-store/data-safety-tr.csv`.
- Google Play herkese açık destek e-postası ve HTTPS destek bağlantısı kaydedildi. Kontrol listesi 10/11. İçerik derecelendirmesi için IARC koşulları bekliyor. Üretim erişimi ayrıca 12 kullanıcının 14 gün kesintisiz kapalı testte kalmasını gerektiriyor.
- Ayrı inceleme hesaplarının girişleri web üzerinde doğrulandı. Bilgileri mağaza konsollarında ve Windows kullanıcı hesabına bağlı şifreli yedeklerde tutulur.
