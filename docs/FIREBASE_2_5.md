# Firebase 2.5: bildirimler ve isteğe bağlı kullanım ölçümü

## Doğrulanan proje durumu

7 Kasım 2026 tarihinde Firebase ortam aracıyla doğrulandı:

- Proje: `my-finance-webapp-fd`.
- Başlangıçta faturalandırma kapalıydı. Yetkilendirilen canlı kurulumda proje mevcut tek açık Firebase Payment hesabına bağlandı; `billingEnabled=true` doğrulandı.
- Firestore: `(default)`, Standard edition, Native mode, `eur3`.
- `monthlyStatementReminders`, `europe-west1` bölgesinde Node.js 22 / 2. nesil olarak yayınlandı; GCP sorgusunda `ACTIVE` ve `maxInstanceCount=1` doğrulandı.
- `firebase-schedule-monthlyStatementReminders-europe-west1` işi `ENABLED`, `0 * * * *`, `Europe/Istanbul` olarak doğrulandı. Çağrı OIDC ile projenin compute hizmet hesabından gelir; Cloud Run invoker izni yalnız bu hesaba verilir. Genel erişim açılmadı.
- FCM HTTP v1 API (`fcm.googleapis.com`) etkin. Firestore kuralları yayınlandı. `pushDevices/hour` ve `notificationDeliveries/expireAt` collection-group artan alan indeksleri doğrudan Firestore Admin API üzerinden `READY` olarak doğrulandı.
- Artifact Registry `gcf-artifacts` deposunda 1 günden eski derleme imajlarını temizleme politikası kuruldu.
- Google Analytics bağlantısı tamamlandı: mevcut kullanıcı hesabı `259204232` içinde My Finance'e ayrılmış property `563168625` oluşturuldu; başka uygulamanın property'si kullanılmadı. Android stream `16294177867`, web stream `16294199824`, web ölçüm kimliği `G-HW2T09THRX`.

Bu kontroller dağıtım ve yapılandırma kanıtıdır. Kullanıcının isteğiyle telefonda yeni test, FCM gönderimi veya Analytics olayı üretilmedi. Gerçek cihaz teslimi ve olayların sunucuda görünmesi kullanıcı kabul turuna bırakıldı. Blaze kullanıma göre ücretlenir; gerçek fatura veya kullanım maliyeti bu çalışmada ölçülmedi.

## Teslim edilen yapı

`functions/src/index.js`, `monthlyStatementReminders` adlı tek saatlik zamanlayıcı içerir. İşlev `europe-west1` bölgesinde, en fazla bir instance ile çalışacak şekilde tanımlanmıştır. Kart başına ayrı Scheduler işi açılmaz. Cihaz kaydındaki saat `Europe/Istanbul` diliminde değerlendirilir; 29–31 gibi kısa aylarda bulunmayan günler ayın sonuna taşınır. Ekstre ve kayıt günü aynı tarihe düşerse tek bildirim hazırlanır.

Cihaz kayıtları `users/{uid}/pushDevices/{installationId}` altında yalnız token, açık/kapalı durumu, saat, saat dilimi ve sunucu güncelleme zamanını içerir. Kart günleri mevcut eşitlenen `meta/profile` belgesinden okunur. Push önizlemesinde banka, kart adı, ekstre içeriği veya tutar bulunmaz. `notificationDeliveries` belgeleri sunucuya ayrıdır; istemci bunları okuyamaz veya değiştiremez. 45 günden eski teslim kayıtları aynı saatlik işte sınırlı gruplar halinde temizlenir. 90 gün yenilenmeyen cihaz kayıtları ve FCM tarafından geçersiz sayılan token'lar kaldırılır.

İşlev, göndermeden önce benzersiz teslim kaydı oluşturur. Yinelenen zamanlayıcı çağrısı aynı bildirimi tekrar göndermez. FCM gönderimiyle Firestore kaydı arasında dağıtık bir işlem yoktur: ağ yanıtı belirsizse yeniden gönderilmez; bu tercih çift bildirim riskini azaltırken nadiren bir hatırlatmanın kaçırılmasına neden olabilir. Android sistem ve ağ kısıtlamaları da teslimi geciktirebilir. “Kesin teslim” garantisi verilmez.

`frontend/src/platform/push.ts`, açık kullanıcı izninden sonra token kaydını ve Android kanalını yönetir. İlk açılışta izin istemez. Hesap eşitlemesi tamamlanmadan bulut planı etkinleşmez. Bulut teslimine geçerken yerel plan iptal edilir; sunucu kapısı kapalıyken yerel hatırlatmalar korunur. Bildirim dokunuşu mevcut PIN kilidi sonrasına saklanan kart akışını kullanır.

`frontend/src/platform/analytics.ts`, Firebase Analytics'i açık cihaz iznine bağlar. Android manifestinde otomatik veri toplama, reklam kimliği ve otomatik ekran raporlama varsayılan kapalıdır. Uygulama reklam depolama, reklam kişiselleştirme ve reklam kullanıcı verisi izinlerini kapalı tutar. Tarayıcıda ölçüm SDK'sı izin verilmeden başlatılmaz. Ürün API'si yalnız sabit olay ve ekran adlarını kabul eder; serbest parametre kabul etmez. Finansal tutarlar, satıcılar, dosya adları, kart adları veya e-posta ölçüme eklenmez. Firebase'in kendi session/device ölçümleri izin sonrasında SDK tarafından işlenebilir.

## Yayın ve derleme yapılandırması

`VITE_FCM_SCHEDULER_ENABLED` kaynak varsayılanı `false` değerindedir. Canlı sunucu ve indeksler hazır olduktan sonra teslim APK'sı `VITE_FCM_SCHEDULER_ENABLED=true` ve `VITE_FIREBASE_MEASUREMENT_ID=G-HW2T09THRX` ile yeniden derlenir. Bayrak derleme zamanına aittir; eski 2.5 APK otomatik olarak açılmaz. Uygulama içindeki açık bildirim ve ölçüm tercihleri ayrıca kullanıcıya aittir.

Canlı kurulumda kullanılan sınırlı yayın hedefi aşağıdadır. İlk kurulum öncesindeki yerel testler önceden tamamlanmıştır; gerçek cihaz testleri tekrar çalıştırılmadı.

```powershell
firebase deploy --only functions:reminders,firestore:rules,firestore:indexes --project my-finance-webapp-fd
firebase functions:artifacts:setpolicy --location europe-west1 --days 1 --force --project my-finance-webapp-fd
```

Yayın diğer Firebase projelerini veya Hosting içeriğini değiştirmedi. `firebase.json` gerekli Functions kod tabanını ve indeksleri tanımlar; mevcut kullanıcı belgeleri yeniden yazılmadı. İlk CLI yayını işlevi oluşturduktan sonra temizleme politikası bulunmadığı için çıkış kodu 1 verdi; yukarıdaki ayrı politika komutuyla eksik adım tamamlandı. Başarı yalnız CLI metnine dayandırılmadı: function, Scheduler ve IAM doğrudan GCP üzerinden tekrar okundu.

Kullanıcının kabul turunda Cloud Scheduler işinin kayıt gününde örnek cihazda teslimi doğrulanmalıdır. Firebase Console üzerinden yalnız kişinin kendi kayıtlı test cihazına gönderim, istemci kaydını doğrular; otomatik tarih eşleşmesi ayrıca gerçek zamanlayıcıyla sınanır. Bu çalışma hiçbir token'a veya topic'e test bildirimi göndermedi.

## Kabul koşulları

1. Google ile giriş ve ilk Firestore eşitlemesi tamamlanır.
2. Kullanıcı yerel ekstre hatırlatmalarını açar, sonra bulut teslimini açıkça seçer.
3. Firestore'da yalnız bu kullanıcının cihaz kaydı oluşur. Başka kullanıcının token'ı okunamaz.
4. Ekstre/kayıt günü ve saat Türkiye saatiyle eşleştiğinde arka plandaki test cihazı FCM bildirimi alır. Kart adı/tutar önizlemede görünmez.
5. Bildirime dokunma PIN kilidini atlamaz. Ekstre ve kayıt aynı güne ayarlıysa tek bildirim görülür.
6. Bulut teslimi açıkken yerel plan bildirim üretmez. Bulut teslimi kapatıldığında yerel plan tekrar oluşur.
7. Kart hatırlatmasını kapatmak, kartı silmek, sistem bildirim iznini kapatmak ve hesaptan çıkmak ayrıca sınanır.
8. Analytics kapalıyken yeni ürün olayı oluşmaz. Kullanıcı izin verdikten sonra yalnız izinli sabit olay/ekran adları görülür. Kapatma yeni olayları durdurur.

## Yerel doğrulama kanıtı

- Functions planlama/teslim mantığı: 10 test geçti; kısa ay, artık yıl, Türkiye saat dilimi, izin/kapalı durum, yinelenen çağrı ve geçersiz token senaryolarını içerir.
- Firestore Emulator: 6 güvenlik testi geçti; anonim ve hesaplar arası erişim, eksik/fazla/yanlış alanlar, teslim kaydı sahteciliği ve mevcut senkronizasyon sorguları sınandı.
- Firebase kurallar doğrulama aracı: sözdizimi hatası bulunmadı.
- Functions modülü Node.js üzerinde içe aktarıldı; `monthlyStatementReminders` export'u doğrulandı.

Bu Windows ortamında Firestore Emulator varsayılan Java geçici Unix socket yoluyla başlayamadı. Yalnız test komutu için aşağıdaki süreç değişkeni kullanıldı; sistem ayarı kalıcı değiştirilmedi:

```powershell
$env:JAVA_TOOL_OPTIONS = '-Djdk.net.unixdomain.tmpdir=C:\Windows\Temp'
firebase emulators:exec --only firestore --project demo-my-finance-rules "npm --prefix functions run test:rules"
```

## Güvenlik sınırı

Firestore için prototip güvenlik kuralları eklendi: mevcut senkronizasyon yolları hesap sahibine ayrılır, cihaz kayıtlarının şeması doğrulanır ve teslim kayıtlarına istemci erişimi kapatılır. Kurallar geniş paylaşım öncesinde ayrıca gözden geçirilmelidir. Mevcut finansal belgelerin tüm alanlarını doğrulayan yeni bir şema göçü bu değişikliğin kapsamında değildir; uyumluluk için yalnız senkronizasyon zarfı doğrulanır.

## Resmi kaynaklar

- [Scheduled Functions](https://firebase.google.com/docs/functions/schedule-functions)
- [Functions ücretlendirme gereksinimi](https://firebase.google.com/docs/functions/faq-and-troubleshooting#cloud-functions-pricing)
- [FCM token yaşam döngüsü](https://firebase.google.com/docs/cloud-messaging/manage-tokens)
- [Capacitor Push Notifications v8](https://capacitorjs.com/docs/apis/push-notifications)
- [Firebase Analytics veri toplama kontrolü](https://firebase.google.com/docs/analytics/configure-data-collection)
- [Analytics DebugView](https://console.firebase.google.com/u/0/project/my-finance-webapp-fd/analytics/debugview)

DebugView yalnız test cihazında debug modu açıkken anlık olayları gösterir. Kullanıcı istediği için fiziksel cihazdaki FCM teslimi veya Analytics sunucu alımı ayrıca denenmedi; kaynak, dağıtım ve APK kanıtı bu ayrı kabul koşullarının yerine geçmez.
