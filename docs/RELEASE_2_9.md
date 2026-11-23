# Mizan 2.9.0

Web ve Android/iOS sürüm numarası 2.9.0. Android ve Xcode derleme numarası 29.

## Veri ve oturum

- `frontend/src/store/AppStore.tsx` Firebase Auth ve Firestore sunucu yanıtından sonra çalışma alanını açar. UID değişince eski listener ve React ağacı kapanır. SDK belleği, PDF kuyruğu, bildirim yönlendirmeleri ve oturuma ait izinler temizlenir.
- `frontend/src/store/legacyCloudMigration.ts` eski IndexedDB kayıtlarını yalnız özgün hesaba taşır. Hesap bilgisi bulunmayan kayıtlar için açık onay alınır. Varsa eski PIN sorulur. Sonraki denemelerin yanlış hesaba gitmesini önlemek için aktarım önce UID’ye bağlanır. Yeni bulut kayıtları ve tombstone’lar korunur. Eski snapshot ve eşitleme kaydı yalnız Firestore başarısından sonra kaldırılır. Başka hesaba ait snapshot özgün hesabın geri dönmesini bekler.
- Eski sürümün yerel kopyayı yeniden oluşturmasını önlemek için IndexedDB şema sürümü 3’e yükselir. Yerel kaydı bulunan bir cihazda 2.8’e dönüş kilidi açmaz. Yayın sorunu çıkarsa ileri yönde düzeltme yayınla.
- Firestore SDK oturum belleği kullanır. Açılışta ağ gerekir. Ağ kesilince açık ekrandaki kayıtlar görünür, yeni değişiklikler geçici olarak bekler. Sunucu onayı beklerken çıkış durdurulur. İşletim sistemi uygulamayı kapatırsa henüz onaylanmamış yazımlar kaybolabilir.
- PIN, tutar gizleme ve isteğe bağlı ölçüm izinleri oturumla sınırlı. Hatırlatma, görünüm ve kurulum tercihleri hesaba bağlı. PDF paylaşım kuyruğu işletim sistemi teslimi için geçicidir. Remote Config SDK’sı herkese açık sürüm politikasını kendi önbelleğinde tutabilir.

## Kod ve varlıklar

| Alan | Değişiklik |
| --- | --- |
| Firebase | `firestore.rules`, `firebase.json`, Firestore taşıması ve Emulator testleri. UID sahipliği, varsayılan ret, doğrulanmış bildirim tercihleri ve canlı kategori kuralında sabit işyeri kimliği. Storage istemci erişimi kapalı. |
| Kartlar | `domain/banks.ts`, `ui/BankLogo.tsx`, `src/assets/banks/`, kart listesi ve detay görünümü. Yerel logolar ve özel kart için kart ikonu. PDF içe aktarma desteği Akbank ve Garanti BBVA şablonlarında devam eder. |
| Analiz | `longitudinal.ts`, `AnalysisView.tsx`, `analysis.css`. Takvim ayında tarih bazlı çizgi ve sütun grafiği, günlük tablo, önceki ay ve geçmiş ortalama karşılaştırmaları. Takvim günü için taksidin muhasebeleştiği tarih, harcama için iadeler düşüldükten sonraki tutar kullanılır. |
| Mobil | Mevcut Android SEND, SEND_MULTIPLE, VIEW ve iOS App Group PDF aktarımı oturum korumasına bağlandı. Yerel hatırlatmalar Android ve iOS’ta, FCM teslimi Android’de kullanılabilir. Bildirim metninde finansal tutar ve kart adı gösterilmez. |

Rules büyük profil ve ekstre listelerinde tür ve boyut sınırlarını denetler. Mevcut dizilerin her bir elemanı Rules tarafından doğrulanmaz. Yetkilendirme yalnız parola/Google oturumu ve belge yolundaki UID’ye dayanır. Dizi elemanlarını yazımda ayrı ayrı kesin doğrulamak, uyumluluk göçüyle bu elemanları ayrı belgelere taşımayı gerektirir.

Logo kaynağı [sabitlenmiş SVG arşivi ve dosya bazlı lisans bilgileri](https://github.com/murattahtaci/turkish-bank-logos-svg/tree/574ce9522c66edfd0a57e2e9cd0b6d9658eccfd7). Garanti BBVA için [bankanın kendi SVG dosyası](https://www.garantibbva.com.tr/content/experience-fragments/public-website/tr/site/header/master/_jcr_content/root/header/headerdesktop/image.coreimg.svg/1699885476212/logo.svg) kullanıldı. İşaretler yalnız ilgili bankayı tanımlamak için gösterilir.

## Yerel doğrulama

- Frontend TypeScript ve üretim derlemesi, 786 frontend testi, 19 Firestore ve Storage Emulator testi ve 11 zamanlayıcı testi geçti. Frontend için ayrı bir lint komutu tanımlı değil. Değişikliklerin boşluk denetimi geçti.
- Chromium, Firebase Auth ve Firestore Emulator ile giriş, çıkış, yenileme, tanımlı bir hesabın devre dışı bırakılması, ağ kesintisi ve geri bağlantı, iki UID arasında veri ayrımı ve eski cihaz kaydının aktarımı doğrulandı. 360 px ve 1440 px’de analiz, +%14 kategori değişimi, açık/koyu tema logo, uzun kart adı ve 360×480 kart modalının kaydırması sentetik kayıtlarla denendi.
- Android release lint sonucu 0 hata ve 29 uyarı. Yedi native test geçti. İmzalı 2.9.0 APK orijinal sertifikayla eşleşti. Android 14 emülatöründe 2.8’in üzerine yüklendi. Dosyalar’da hem **Paylaş** hem **Birlikte aç** Mizan’ı gösterdi. Girişten önce özel alana alınan iki PDF’nin SHA-256 özetleri kaynaklarıyla eşleşti.
- iOS proje grafiği, uzantı gömme, App Group ve PDF etkinleştirme kuralları statik olarak doğrulandı. Xcode derlemesi, fiziksel cihaz kabulü, canlı Google girişi ve canlı FCM teslimi sürüm kabulüne açık.

## Canlı yayın · 22 Kasım 2026

Mizan 2.9.0 [Firebase Hosting’de](https://my-finance-webapp-fd.web.app) yayında. 73 dosyanın tamamı yerel üretim derlemesiyle SHA-256 düzeyinde eşleşti. Analiz adresi oturum açılmadan giriş ekranını gösterdi. Firestore ve Storage kurallarının canlı kaynakları yerel dosyalarla eşleşti. Firestore indeksleri dağıtıldı. `monthlyStatementReminders` etkin ve zamanlayıcısı Türkiye saatine göre her saat başında çalışacak şekilde yapılandırıldı.

## 2.9.3 · Ekstre onayı ve geri alma

Ekstreler kayıttan önce banka, hedef kart, dönem, işlem sayısı ve okunabilen dönem borcuyla gösterilir. PDF’de açıkça etiketlenmiş maskeli kartın son dört hanesi okunabiliyorsa kayıtlı kartla karşılaştırılır. Kart sahipliğini kullanıcı kontrol eder. Birebir PDF kopyası atlanır. Aynı kart ve döneme ait farklı PDF ancak Ekstre Detayı’ndaki **PDF ile düzelt** akışından onaylanabilir.

Ekstre Detayı ve Arşiv, silmeden önce bağlı hareket sayısını gösterir. Silme bildirimindeki **Geri al**, ekstreyi ve özgün hareketlerini geri getirir. Aynı dönem yeniden eklendiyse veya hareket kimliği çakışırsa mevcut kayıtlar korunur. Toplu aktarımda hareketleri eşitlenmiş ama ekstre kaydı oluşmamış aynı PDF, hareketleri çoğaltmadan tamamlanabilir.

Web paketi Firebase Hosting’e dağıtıldı. Android 2.9.3 (32) orijinal sürüm anahtarıyla imzalandı ve 2.9.2 üzerinde emülatörde yükseltildi. iOS hedefleri 2.9.3 (32) olarak güncellendi. IPA derlemesi ve fiziksel iOS cihaz kabulü Xcode gerektirir.

## Firebase dağıtımı

Komutları depo kökünden çalıştır. Geçiş kuralları 2.8’in kategori yeniden öğrenme ve ekstre geri yükleme yazımlarını kabul eder. 2.8 istemcisi hesap tercihleri belgesini yeniden yazarsa yeni tercih alanlarını kaldırabilir. Aynı hesapta 2.9 tercihlerini tutarlı kullanmak için cihazlardaki uygulamaları güncelle. Yeni minimum sürümü, doğru mağaza veya dağıtım adresleri ve yeni imzalı paketler hazır olduktan sonra Remote Config’den belirle.

```powershell
npm.cmd --prefix frontend ci
npm.cmd --prefix frontend test
npm.cmd --prefix frontend run build
npm.cmd --prefix functions ci
npm.cmd --prefix functions run check
firebase.cmd emulators:exec --only firestore,storage --project demo-my-finance-rules "npm --prefix functions run test:rules"
firebase.cmd deploy --project my-finance-webapp-fd --only "firestore:rules,firestore:indexes,storage"
firebase.cmd deploy --project my-finance-webapp-fd --only functions:reminders
firebase.cmd deploy --project my-finance-webapp-fd --only hosting
```

Firebase istemci yapılandırmasını `frontend/.env.example` ile eşleştir. İmzalama parolaları ve servis hesabı anahtarları sunucu veya derleme ortamında kalır. Android FCM için zamanlayıcının ve indekslerin dağıtımını doğruladıktan sonra `VITE_FCM_SCHEDULER_ENABLED=true` ile paket oluştur. Önceki cihaz bazlı FCM tercihi hesap tercihiyle değiştiği için Bulut bildirimleri’ni yeniden aç ve gerçek teslimi kontrol et.

## Android Studio ve Xcode kabulü

- [ ] Android’de aynı imza ile 2.8’den yükselt. Eski hesabı aç, veri aktarımını tamamla ve uygulamayı kapatıp aç. Kayıtların sürdüğünü doğrula.
- [ ] Dosyalar’dan PDF’yi **Paylaş** ve **Birlikte aç** ile gönder. Oturum kapalıyken alınan PDF’yi girişten sonra işle. Bozuk dosya, çoklu paylaşım ve hesap değişiminde kuyruk temizliğini dene.
- [ ] Android’de bildirim iznini aç. Test bildirimi, gerçek kart kesim gününde FCM, kapalı izin ve çevrimdışı cihaz teslimini ayrı doğrula. Bildirime dokununca doğru kartı aç.
- [ ] macOS üzerinde [iOS paketleme adımlarını](../frontend/ios/README.md) çalıştır. `App` ile `MizanShare` hedeflerini aynı Apple ekibi ve App Group yetkisiyle imzala. Fiziksel cihazda Files paylaşım menüsü, belge açma, girişten sonra işlem, izin isteme, kısa ay kesimi ve arka plan bildirimi doğrula.
- [ ] Her iki mobil platformda güvenli alan, klavye açıldığında modal kaydırma ve büyük yazı ayarını dene. Gerçek Google oturumu, hesabı değiştirme ve senkronu canlı Firebase üzerinde kontrollü hesaplarla doğrula.
