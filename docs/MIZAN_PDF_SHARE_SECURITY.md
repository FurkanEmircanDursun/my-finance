# Mizan 2.8 — PDF paylaşımı ve güvenlik

14–15 Kasım 2026. Bu çalışma; dış uygulamadan gelen PDF'yi mevcut ekstre akışına bağlar, banka ayrıştırıcısından önce içerik doğrular ve Firebase hatalarını kullanıcıya yönelik mesajlara dönüştürür.

## Paylaşım mimarisi

Android'de `SEND`, `SEND_MULTIPLE` ve PDF `content://` adresli `VIEW` intentleri karşılanır. Dosya yöneticisinin gerçek paylaş menüsünde **Mizan / Mizan’a Gönder** hedefi doğrulandı. Uygulama kapalıyken gelen dosya özel cihaz kuyruğuna alınır; kurulum veya PIN kilidi geçilmeden finansal ekrana verilmez.

iOS için gerçek Capacitor uygulaması ve gömülü `MizanShare.appex` hedefi oluşturuldu. İki hedef `group.com.faraday.followfinance` grubunu kullanır. Share Extension dosyayı ortak alana alır; Mizan ön plana geldiğinde aynı içe aktarma akışı açılır. Apple'ın desteklediği Share Extension akışı uygulamayı zorla açmaz. PDF **Open in Mizan** belge rotası uygulamayı doğrudan açar. Kullanıcıya bu iki davranış açıkça anlatılır.

iOS paylaşım listesindeki hedef **Mizan**, açılan uzantının başlığı **Mizan’a Gönder** olarak görünür. Apple, iOS 13'ten itibaren paylaşım listesinin uzantı adı yerine ana uygulamanın adını kullandığını açıklar ([Apple paylaşım rehberi, 5:48](https://developer.apple.com/videos/play/tech-talks/210/?time=348)). Bu nedenle yalnız menü etiketine bakmak, paylaşım uzantısını belge açma rotasından ayırmaya yetmez; kabul testi uzantının kendi başlığını ve dosya kaydetme sonucunu da doğrular.

Native kuyruk en fazla beş PDF, dosya başına 25 MiB ve toplam 50 MiB ile sınırlandırılır. PDF başlığı, boyut, güvenli kaynak ve geçici dosya yolu denetlenir. Aynı bekleyen paylaşım tekrar eklenmez. Dosyalar yedeklemeden hariçtir; 24 saatlik süre kuyruk erişiminde uygulanır. İçe aktarma sonucu kullanıcı tarafından kapatıldığında özel kopya silinir. Beklenmedik ekran/oturum değişimi tamamlanmamış paylaşımı onaylamaz.

Çıkış, hesap silme ve cihaz temizliği bekleyen paylaşım kopyalarını da temizler. Android'de tüm Activity örnekleri tek iş kuyruğu kullanır. iOS'ta uygulama ve uzantı ayrı işlemler olduğundan, nesil belirteci ve ortak `flock` kilidi kullanılır: dosyalar özel geçici alanda hazırlanır, kısa kilit altında nesil doğrulanıp kaydedilir. Temizleme aynı kilitte nesli değiştirir. Önceki oturumda açılmış uzantı yeni hesaba dosya ekleyemez.

## İçerik doğrulama

Dosya kabı PDF.js/OCR yüklenmeden önce kontrol edilir. Metin çıkarımı, banka işlemlerini ayrıştırmakla aynı işlem değildir: okunabilir metinden banka kimliği, ekstre dönemi ve ekstreye özgü kapak/tablo işaretleri doğrulandıktan sonra banka ayrıştırıcısı çağrılır. Sadece banka adı, tarih veya tutar geçmesi yeterli değildir.

Akbank/Axess ve Garanti BBVA/Bonus PDF şablonları, doğrulanmış harcamasız dönemler, EBCDIC ve OCR yolları korunur. TXT/CSV dışa aktarımları ayrı yol kullanır. Dekont, fatura, ilgisiz belge, desteklenmeyen banka ve çelişkili banka kimlikleri açık gerekçeyle reddedilir. Bu doğrulama belgenin dijital imzasını veya bankadan geldiğini kriptografik olarak kanıtladığı iddiası taşımaz.

Gerçek Axess PDF'si tamamen yerelde işlendi: 32 işlem, sıfır atlanan satır ve tutan mutabakat. Yedi alakasız PDF reddedildi; mevcut özel Garanti metni kabul edildi. Gerçek belge içeriği CI'ya, kaynak kontrolüne veya paylaşılabilir görsellere gönderilmedi. Taranmış/şifreli/bozuk belge yolları ayrıca sahte PDF.js/OCR yanıtlarıyla test edilir; bu testler fiziksel belge kabulüyle karıştırılmaz.

## Firebase ve kullanıcı mesajları

Firestore yetkisi yalnız Auth UID ve tam belge yolundan gelir. İstemci kendi rolünü veya sahipliğini belirleyemez. Create ve update aynı dış şema doğrulamasını kullanır; bilinmeyen yollar kapalıdır. Mevcut eşitleme, tombstone, eski veri temizleme ve bildirim yolları korunur. Storage istemci erişimi tamamen kapalıdır; PDF'ler buluta yüklenmez.

Güvenlik kuralları; sahiplik, varsayılan ret ve doğrulama testleriyle güçlendirilmiş bir prototiptir. Geniş kullanıma açmadan önce bağımsız inceleme önerilir. Tek profil belgesindeki büyük iç içe listelerin her elemanı Rules tarafından doğrulanmaz; kalan sahip-verisi bütünlüğü sınırı [güvenlik doğrulama raporunda](FIREBASE_SECURITY_VERIFICATION_20261114.md) açıklanır. Bu sınır farklı kullanıcının verisine erişim hakkı vermez.

Ham Firebase mesajı, dosya yolu, token veya tanınmayan hata kodu UI'ya aktarılmaz. Merkezi eşleyici; süresi dolmuş oturum, yetki, bağlantı, yoğunluk, kayıp dosya ve iptal durumlarını ayrı anlatır. Yalnız uygulamanın açıkça oluşturduğu `UserFacingError` ile doğrulama/ayrıştırma hata sınıfları kendi ürün metnini gösterebilir. Devam eden ayrıştırma oturum değişince finansal kayıt veya analitik olay yazamaz.

## Yayın ve kanıt kapsamı

Web 2.8.0, Firestore ve Storage kuralları Firebase'e yayınlandı. Yayındaki uygulama/Analiz modülü hash'leri ve iki Rules kaynağı yerel dosyalarla birebir eşleşti. Canlı anonim Firestore okuması 403, Storage listelemesi 403 ve doğrudan bucket listelemesi 401 döndü. Bucket denetimi sıfır nesne, herkese açık IAM/ACL izni ve indirme tokenı gösterdi.

18 emulator testi; misafir, farklı hesap, sahip, create/update baypası, tam ekstre ve 240 aylık profil gibi olumlu/olumsuz durumları geçti. Son frontend kapısı **769 test / 68 dosya**, TypeScript ve üretim derlemesini geçti. Bildirim ayarları ve en dış React hata sınırında da ham SDK mesajları kaldırıldı; hata ekranı veri sıfırlamayı önermez. Makinece okunabilir kanıtlar Git dışında `output/qa/pdf-share-security/` altındadır.

15 Kasım'daki son odaklı kontrol, paylaşım kuyruğu ve UI teslimi, PDF içerik/SDK uyumluluğu, oturum değişiminde ayrıştırmayı durdurma, Firebase hata eşlemesi ve React hata sınırı için **123 test / 9 dosya** ile geçti. Android yerel dosya-kopyalama raporunda ayrıca altı test, sıfır hata ve sıfır atlama bulunur. Son web derlemesi ve yayındaki uygulama hash'i değişmedi.

Android 14 / Chrome 113 içeren ayrı ve temiz AVD'de gerçek Files paylaş menüsü, ilk kurulum bitene kadar bekleyen soğuk başlangıç, açık uygulamada çoklu PDF ve alakasız belge reddi doğrulandı. Geçerli dosyanın iki alışverişi toplam 350 TL olarak kaydedildi; tekrar `VIEW` içe aktarımı sıfır yeni / iki mevcut işlem gösterdi ve toplamı değiştirmedi. Bitti sonrasında özel kopyalar temizlendi. Tüm veriler sentetiktir; gerçek telefona veya kullanıcının A35 cihazına dokunulmadı.

Cihaz kabulü iki gerçek uyumluluk sorununu yakaladı: PDF.js ana modül ve worker'ı birlikte legacy sürüme geçirildi; eski WebView'da eksik stream async iterator için yalnız PDF metin okumasında `getReader()` yolu eklendi. Normal tarayıcı yolu korunur. Hatalı akışta reader kilidi ve PDF belgesi temizlenir. Ayrı süreçlerde gerçek SDK testleri ve aynı Chrome 113 cihazındaki başarılı içe aktarma bu dar düzeltmeyi doğrular; tüm eski tarayıcıların her PDF özelliğinin desteklendiği iddia edilmez.

İmzalı Android 2.8.0 / kod 28 paketi `artifacts/mizan-2.8.0-android-release.apk` konumundadır. SHA-256: `7244D6AE2643D980414A11CD1BBC08E10B6C91DF46318D9D0F8ABD58CED9C91B`. V2 imzası doğrulandı; sertifika mevcut 2.5.0 release paketiyle aynıdır. Android native PDF testleri ve üretim paketleme geçti. Bu imzalı paket ayrıca aynı izole AVD'ye kuruldu: gerçek Files paylaşımı, kurulum sonrasında otomatik harcamasız ekstre içe aktarımı, Bitti ile kapatma ve soğuk yeniden açılışta paylaşımın tekrarlanmaması görünür arayüz ve ADB dokunuşlarıyla doğrulandı. Kanıt `output/qa/pdf-share-security/release-smoke/release-smoke-result.json` ve eşlik eden ekran görüntülerindedir. Bu bir simülatör kabulüdür; fiziksel telefon doğrulaması yapılmadı.

Xcode 26.6 / Build 17F113 üzerinde gerçek App ve gömülü Share Extension derlemesi; son Mizan ikon/açılış görselleri ve iki süreçli nesil testiyle geçti. iOS 26.5 / iPhone 17 Pro simülatöründeki [son uçtan uca kabul çalışması](https://github.com/FurkanEmircanDursun/my-finance/actions/runs/43644070825) da başarılıdır. Gerçek sistem paylaşım menüsünden Mizan seçildi; uzantının kendi başlığı ve dosya kaydetme sonucu doğrulandı. İkinci test Mizan'ı açtı; **1 işlem eklendi**, **Akbank AXESS · Eylül 2026** ve tutan mutabakat gerçek uygulama ekranında görüldü. Sonuç ekranını kapatmak aynı ortak alandaki PDF ve teslim kaydını temizledi.

Kanıt, yalnız UI metnine dayanmaz: işletim sisteminin oluşturduğu tek `group.com.faraday.followfinance` klasörü kendi gerçek metadata kimliğiyle, tam simülatör kimliği ve kanonik yol sınırlarıyla bulundu. İçindeki tek PDF **12.297 bayt** ve kaynağıyla aynı SHA-256/fingerprint değerindedir. `simctl` soğuk ana uygulama için grup eşlemesi döndürmediğinden klasör salt okunur metadata keşfiyle bulundu; test hiçbir ortak klasör, PDF veya teslim kaydı oluşturmadı. Uygulamadaki gerçek içe aktarma ve aynı klasörün temizlenmesi ortak alanın iki süreç tarafından kullanıldığını ayrıca kanıtlar. Ayrıntılar `output/qa/ios-ci/run-43644070825-artifacts/summary.json` ile XCTest kayıtları ve ekran görüntülerindedir.

CI yalnız kaynaklarla sınırlandırılmış `codex/mizan-ios-share-verification` dalını kullanır; bu dal ana dala birleştirilmek için hazırlanmış bir ürün dalı değildir. Asıl çalışma dalı, HEAD ve önceden stage edilmiş değişiklikler korunur. iOS kabulü çevrimdışı CI derlemesi ve sentetik PDF ile yapıldı; gerçek hesapla Firebase oturumu açıldığı veya fiziksel cihaza dağıtıldığı iddia edilmez.

iPhone/iPad dağıtımı için uygulama ve uzantının aynı Apple geliştirme ekibiyle imzalanması, iki bundle ID ve App Group yetkisinin gerçek provisioning profillerine eklenmesi gerekir. Firebase iOS kaydı ve gerçek `GoogleService-Info.plist` oluşturulmuştur; bu işlem Apple geliştirici yetkisi veya fiziksel iOS kabulü yerine geçmez.
