# Mizan güncelleme ve performans servisleri

## Güncelleme davranışı

`UpdateGate`, Firebase Remote Config üzerinden `min_required_version`, `latest_version`, `update_url` ve `update_message` alanlarını okur. Android/Capacitor sürümü `App.getInfo()` ile kurulu paketten, web sürümü `__APP_VERSION__` derleme sabitinden alınır.

`update_url_android` ve `update_url_ios` ayrı platform hedefleridir. Kullanıcının talebiyle şimdilik boştur; mağaza veya paket yayınlandığında Firebase Console üzerinden doldurulur. Native hedef boşsa genel web adresi mobil güncelleme istemi açmaz. Eski `update_url` alanındaki doğrulanabilir, doğru platforma ait mağaza adresi geriye uyumlu yedek olabilir. Gelecekte bağlantı eklemek için uygulama kodu değiştirmek gerekmez.

- Kurulu sürüm minimumdan eskiyse uygulama ağacı yerine tam sayfa, kapatılamayan güncelleme görünür. Android geri tuşu bu ekranı kapatmaz.
- Minimum karşılanıyor, son sürüm karşılanmıyorsa kapatılabilir öneri görünür. Daha Sonra aynı son sürümü 24 saat gizler; yeni son sürüm tekrar görünür. Erteleme zorunlu güncellemeyi bastırmaz.
- Güncel sürümde güncelleme ekranı gösterilmez.
- Son doğrulanmış politika cihazda saklanır. Bağlantı kopması önceden doğrulanmış zorunlu güncellemeyi kaldırmaz. Geçerli önbelleği bulunmayan çevrimdışı kurulum yerel kayıtları kullanmaya devam eder.
- Hatalı sürüm, minimumun son sürümden yüksek olması, güvensiz ya da eksik güncelleme adresi yeni politikayı geçersiz kılar. Geçerli mevcut politika korunur; geçerli politika yoksa uygulama kilitlenmez.

SDK açılışta fetch/activate yapar; önbellek süresi bir saat, istek zaman aşımı sekiz saniyedir. Gerçek zamanlı `onConfigUpdate` değişiklikleri etkinleştirir. Ağın dönmesi ve sayfanın yeniden görünür olması yeni kontrol başlatır.

## Yayınlanan template ve yayın sınırı

14 Kasım 2026 tarihinde `my-finance-webapp-fd` için başlangıç şablonu `{}` olarak okundu. Kullanıcının açık yayın onayından sonra, yayından hemen önce tekrar okunarak başka bir ayar bulunmadığı doğrulandı. `remoteconfig.template.json`, Firebase CLI 15.36.0 ile yalnız Remote Config hedeflenerek yayınlandı. Sürüm geçmişi **1**, yayın zamanı **2026-11-14 11:01:33 UTC**; tekrar indirilen şablonda altı parametrenin tamamı yerel adayla aynıydı. Kanıt özeti: `output/qa/mizan-2.6/remoteconfig-receipt.json`.

İlk yayındaki template zorunlu güncellemeyi açmadı: minimum `0.0.0`, son sürüm `2.6.0` ve güncelleme adresi mevcut web Hosting adresiydi.

14 Kasım 2026 **12:19:18.764846 UTC** tarihinde yayınlanan **2** numaralı template, yalnız `latest_version` değerini `2.7.0` olarak güncelledi. Yayın öncesi ve sonrası okuma, diğer parametrelerin korunduğunu doğruladı. O yayının kanıtları `output/qa/analysis-session/remoteconfig-before.json`, `remoteconfig-after.json` ve `remoteconfig-version.json` altındadır.

PDF paylaşımı/güvenlik yayınıyla son sürüm **2.8.0** oldu. `output/qa/pdf-share-security/remoteconfig-before.json` ve `remoteconfig-after.json` karşılaştırması, yalnız `latest_version` parametresinin değiştiğini doğrular. Güncel minimum `0.0.0`, web adresi `https://my-finance-webapp-fd.web.app`; Android/iOS URL alanları boştur. Zorunlu güncelleme açılmadı. Mobil mağaza bağlantıları gerçekten yayınlandığında platform alanlarından yönetilir; henüz bir mağaza yayını varmış gibi davranılmaz.

Remote Config becerisi template yayını öncesinde kullanıcının somut JSON dosyasını incelemesini ve yayın onayını ister. Yayınlanacaksa `firebase.json` içindeki `remoteconfig.template` yolu mevcut Hosting, Functions ve Firestore ayarları korunarak bu dosyaya bağlanır. Yeni bir template yayınından önce güncel template/ETag yeniden okunup başka ayarların üzerine yazılmadığı doğrulanmalıdır; `force` kullanılmamalıdır.

## İsteğe bağlı performans ölçümü

Firebase Performance Monitoring, ayrı ve cihazda saklanan bir onayla açılır. Mevcut Analytics onayı performans ölçümünü kendiliğinden açmaz. `DiagnosticsSettings` ekranı bu tercihi kullanıcıya açıkça sunar.

Otomatik sayfa ve HTTP/URL izleri kapalıdır. Servis yalnız `screen_render`, `statement_parse`, `quote_refresh`, `update_check` ve `backup_export` adlarıyla süre kaydedebilir. Tutar, işlem açıklaması, dosya adı, kart, hesap, URL veya hata yığını için parametre alanı yoktur. Onayın geri alınması yeni ölçümü hemen durdurur. SDK ya da ağ hatası temel işlemi durdurmaz.

Kurulu Performance SDK, özel izlere de kendi belgesinin adresini ekler. Bu nedenle SDK finans ekranında başlatılmaz: sabit `/diagnostics.html` belgesinde, referrer olmadan çalışan gizli iframe yalnızca izinli işlem adı ve sınırlı süre alır. Belge sorgu/fragment içerirse çalışmaz; mesajlarda kaynak pencere, origin, kanal ve alanlar doğrulanır. İzin geri çekildiğinde iframe ve içindeki SDK kuyruğu kaldırılır. Gerçek kurulu SDK serializer testi ve tarayıcıdaki kart detayı geçişi, ölçülen belge adresinin kart kimliği içermediğini doğruladı. Standart Firebase kurulum, cihaz ve bağlantı metadata'sı performans servisinin parçasıdır; canlı panel alımı ayrıca doğrulanır.

Web Analytics özel olayları sabit `page_location`, boş `page_referrer` ve genel `page_title` kullanır. Ekran isimleri kapalı bir listedendir; finansal detaylar olay API'sinin parametreleri olarak kabul edilmez.

Bu katman Web SDK ile süre ölçer; native Crashlytics yerine geçtiği iddia edilmez. Gerçek native çökme raporlaması ayrıca Crashlytics eklentisi/Gradle kurulumu ve cihazdan doğrulama gerektirir. Canlı Firebase paneline olayların ulaştığı yalnız yerel testlerden çıkarılamaz.

## Kaynaklar

- [Remote Config Web API](https://firebase.google.com/docs/reference/js/remote-config)
- [Remote Config yükleme stratejileri](https://firebase.google.com/docs/remote-config/loading)
- [Performance Monitoring Web kurulumu](https://firebase.google.com/docs/perf-mon/get-started-web)

Yerel SDK tipleri Firebase JS `12.18.0` altında `@firebase/remote-config` `0.9.2` ve `@firebase/performance` `0.7.14` için ayrıca kontrol edilmiştir.
