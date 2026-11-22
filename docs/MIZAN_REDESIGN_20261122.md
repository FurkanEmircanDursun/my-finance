# Mizan Ay Özeti yeniden tasarımı

22 Kasım 2026 · Mizan 2.8.0 · Firebase Hosting’de canlı

## Yön ve gezinme

İki prototipte de aynı beş görev 13 eylem gerektirdi. İş merkezli yön ilk PDF yüklemesinde bir eylem kazandırdı. Ay merkezli yön aylık durumu açılışta göstererek bir eylem kazandırdı ve eşitlik kuralıyla seçildi. [Tıklanabilir prototipler, kaynaklar ve eylem dökümü](../output/playwright/mizan-design/README.md)

Ay Özeti, İşlemler, Kartlar ve Analiz günlük gezinmeyi oluşturur. Analiz’den Varlıklar, Gelecek ve harcama ayrıntıları açılır. Ayarlar’daki hesap, cihaz ve yedek eylemleri erişilebilir. İşlem Ekle ana ekrandan tek eylemle açılır. Ekstre Detayı kendi adresine ve kart bağlamına sahiptir. [Tasarım sistemi](../DESIGN.md)

## Önce ve sonra

| Görev | Önce | Sonra |
| --- | ---: | ---: |
| Ayın durumunu anlamak | 0 | 0 |
| Gider eklemek ve geri almak | 5 | 5 |
| Bankanın dönem borcunu görmek | 3 | 0 |
| Yeni ekstre PDF’si yüklemek | 4 | 4 |
| Hatalı kayıtlı ekstreyi doğru PDF ile yenilemek | 6 | 4 |
| Okunamayan dosyadan başarılı yüklemeye ulaşmak | 9 | 7 |

Ölçüm Ay Özeti’nden başlar. Her kontrol, dolan alan ve dosya seçimi bir eylem sayılır. Kaydırma sayılmaz. Dönem seçimi ve yükleme sonuçları, masaüstü ve dar telefon görüntüleriyle birlikte ayrı rapordadır. [Önceki sürüm denetimi](../output/playwright/mizan-before/AUDIT.md) · [Sonraki sürüm ve tarayıcı kanıtları](../output/playwright/mizan-after/QA.md)

## Yerel derleme ve veri doğrulaması

- `frontend` içinde `npm run build` derlemeyi `frontend/dist` altında üretir. `npm run preview` bu derlemeyi yerelde açar.
- 68 dosyada 781 frontend testi, 11 bildirim planlama testi ve 18 yerel Firebase kural testi geçti.
- Doğrulanamayan sentetik akışta 95 hareketli önceki ekstre, özgün PDF yüklenince 96 eşsiz harekete çıktı. Ekstre ve kart kimlikleri ile elle seçilen kategori korundu. Aynı dosyanın tekrar yüklenmesi yeni hareket eklemedi. Aynı bankaya ait ayrı seyahat kartının iki hareketi kendi kartına bağlandı.
- Masaüstü, 768 px tablet, 360 px telefon ve 320 px dar telefon yerleşimleri denendi. Aylık özet, işlem alanı, uzun ekstre, büyük TL tutarı, açık/koyu tema, klavye odağı ve azaltılmış hareket kanıtları raporda.
- Masaüstü Chromium, dokunmatik Chromium ve Playwright WebKit tarayıcı kontrolleri ayrı ayrı çalıştı. Android API 36 Capacitor emülatöründe çevrimdışı açılış, yerel dosya seçici, PDF düzeltmesi, gerçek klavye, geri tuşu, koyu tema, azaltılmış hareket ve kurulum üstüne güncelleme doğrulandı. Yedi Android birim testi geçti. [Yerel uygulama doğrulaması](../output/playwright/mizan-native/yerel-uygulama-dogrulama.md) · [Android debug APK](../output/playwright/mizan-native/mizan-redesign-android-debug.apk)
- iOS hedef ve paylaşım uzantısı doğrulayıcısı geçti. iOS paketine son web derlemesinin varlıkları kopyalandı. Bu Windows ortamında Xcode ve iOS çalışma zamanı bulunmadığı için iOS derlemesi, cihaz klavyesi ve iOS geri hareketi çalıştırılarak doğrulanamadı.
- Figma bağlantısı geçersiz yetki belirteci döndürdü. Masaüstü ve telefon için Ay Özeti, İşlem Ekle ve Ekstre Detayı düzenlenebilir React bileşenleri ve CSS tasarım değişkenleri olarak teslim edildi. [Prototip kaynak paketi](../output/playwright/mizan-prototype-source.zip)

## Tarayıcı ve WebView

Yerel diyalog destekleyen çalışma zamanlarında `showModal()` kullanılır. Eski çalışma zamanında odak ve arka plan ayrımı için yedek uygulanır. iOS 15.4 diyalog desteğinin başlangıcıdır. [WebKit Safari 15.4](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/)

Sayfa hareketleri CSS `transform` ve `opacity` ile sınırlı. `prefers-reduced-motion` altında yerleşim, odak ve geri bildirim hareket olmadan çalışır. Android güvenli alanlarının davranışı, WebView sürümü ve etkin kenardan kenara yapılandırmasına bağlıdır. [Android WebView pencere boşlukları](https://developer.android.com/develop/ui/views/layout/webapps/understand-window-insets) · [WebKit güvenli alanlar](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)

## Firebase Hosting yayını

Mizan web derlemesi `my-finance-webapp-fd` projesinin canlı Hosting kanalına gönderildi. Her iki alan adının giriş sayfası, SPA yönlendirmesi ve girişte kullanılan altı dosya yerel derlemeyle bayt düzeyinde karşılaştırıldı. [Canlı site](https://my-finance-webapp-fd.web.app/)

Yayın öncesinde eski gezinme, önceki Ay Özeti ve sayfa geçişlerine ait 172 kullanılmayan CSS seçicisi temizlendi. Ana CSS dosyası 11.052 bayt küçüldü. Refactor sonrasında 781 frontend testi, üretim derlemesi ve sentetik kayıtlarla masaüstü ve dar telefon tarayıcı kontrolleri geçti. Canlı adreste mobil Chromium ile Ay Özeti, İşlem Ekle, Ekstre Detayı ve tarayıcı geri gezinmesi de doğrulandı. [Canlı mobil Ay Özeti](../output/playwright/mizan-after/hosting-phone-overview.png)

Canlı oturum açma, cihazlar arası bulut eşitleme ve fiziksel cihaz kabulü bu doğrulama turunda çalıştırılmadı.
