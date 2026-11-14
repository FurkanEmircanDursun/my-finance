# Sürüm hazırlığı — 3 Kasım 2026

## Değişen deneyim

- Özet, tek kart/ekstre odağından takvim ayında kart, kira ve nakit giderlerini birleştiren çalışma alanına dönüştü.
- Masaüstünde kalıcı gezinme; telefonda tek sütun ve başparmak erişiminde kayıt düğmesi. Nakit harcamayla başlamak için ekstre yükleme zorunluluğu kaldırıldı.
- Ortak kayıt formunda kira/fatura kısayolları, ödeme yöntemi, gerçek tarih ve gelir/gider seçimi var. Eski işlem listesindeki ekleme aynı formu açar.
- Ana tutarda kart, kira/aidat ve diğer kart dışı giderler ayrı görünür. Kaydedilmiş gelir ile kalan ayrıca gösterilir; banka bakiyesi olarak sunulmaz.
- Harcama ritmi, kategori dökümü, son hareketler, bulgular, bütçeler, sabit giderler, bonus/puanlar ve yedekler erişilebilir.
- Tam ekstre hesabı, takvim ayı harcamasından ayrıldı. Güncel kayıtlardaki mutabakat farkları ana görünümde uyarı verir.
- Türkçe binlik/ondalık tutar girişindeki kısmi okuma sorunu giderildi. Apple faturalama açıklaması kategori eşleşmesi düzeltildi.

## Veri uyumu

İşlem şeması ve şema sürümü korunur. Yeni ödeme yöntemleri mevcut `accountLabel` alanında saklanır. Yeni veritabanı veya bulut kaynağı açılmadı. PIN, gizlilik, yerel kayıt, yedek/göç ve isteğe bağlı senkron akışları korunur. Önceden yanlış girilmiş tutarlar ve kullanıcı kategorileri sessizce değiştirilmez.

## Doğrulama

- Başlangıç: 373 test geçti. Yeni tutar/tarih, birleşik gider ve sınıflandırma regresyonlarıyla 379 test.
- TypeScript kontrolü ve Vite üretim derlemesi.
- Yerel Chrome/Playwright, sentetik veriler: 15.000 TL kira + 125,50 TL nakit + 400 TL CSV gider = 15.525,50 TL; 40.000 TL gelirden kalan 24.474,50 TL.
- CSV tekrar yükleme yeni kayıt üretmedi. Yenileme sonrası kayıtlar korundu. Tutar gizleme, mobil Harcamalar/Gelecek gezinmesi ve yatay taşma kontrol edildi. Tarayıcıda yakalanan JavaScript hatası yok.
- Altı gerçek PDF, toplam 359 satır: otomatik banka mutabakatında her belgede 0,00 TL fark. Ayrıntılar Git dışında tutulan `data/statement-audit-2026-11-02.md` dosyasında. Kategori doğruluğu bu eşitlikten ayrı değerlendirilir.
- Bağımsız kaynak/görsel incelemesi: kart harcaması olan ayın yanlış boş durumu düzeltildi; kısa ekranlarda kenar çubuğuna kaydırma eklendi.

## Yerel kontrol ve yayın sınırı

`frontend` içinde `npm install`, `npm test`, `npm run build`. Üretim çıktısı `frontend/dist`.

Web sürümü 3 Kasım 2026 tarihinde mevcut Firebase Hosting sitesine yayınlandı: https://my-finance-webapp-fd.web.app. Yalnızca Hosting dağıtımı yapıldı; Firebase kuralları veya üretim verileri değiştirilmedi. Gerçek Android cihazı, yerel kabuk yeniden derlemesi ve oturum açılmış çok cihazlı senkron bu çalışmada doğrulanmadı. Bu kontrollerin geçmişten kalan testleri bulunması, yeni bir canlı/cihaz kanıtı sayılmaz.

Tarayıcı testleri ayrı geçici profilde ve sentetik verilerle yapıldı; gerçek PDF'ler dağıtım çıktısına alınmadı. Görsel tasarım sisteminin kaynağı DESIGN.md, ürün davranışının kaynağı PRODUCT.md.

## Bağımsız son inceleme kararı

Son inceleme kabul edildi; açık maddi bulgu kalmadı.

| Bulgu | Son durum | Kanıt |
|---|---|---|
| İçe aktarılmış kart harcaması bulunan ayın yanlış boş görünmesi | Çözüldü | Boş durum, kart ve manuel harcamayı da hesaba katıyor. |
| Kısa masaüstünde kenar çubuğu erişimi | Çözüldü | Dikey kaydırma mevcut; 1366×768 görünümünde Ayarlar erişilebilir. |

Son tarayıcı turunda 390 ve 375 px yatay taşma kontrolü, koyu tema ve azaltılmış hareket ayarı da geçti. Bu karar kaynak, sentetik ekran görüntüleri ve yerel kontrol sonuçları kapsamındadır.


## Canlı yayın doğrulaması — 3 Kasım 2026

Kullanıcının siteyi güncelleme talebiyle üretim derlemesi yeniden alındı ve `firebase deploy --only hosting --project my-finance-webapp-fd --non-interactive` başarıyla tamamlandı. Firebase eklentisindeki ilk deneme hedef çözümleme aşamasında başarısız olduğundan mevcut site CLI ile doğrulanıp aynı hedefe dağıtıldı.

Yayın sonrasında canlı index.html ve yedi temel JS/CSS dosyası HTTP 200 döndürdü. Her dosyanın SHA-256 özeti yerel üretim çıktısıyla birebir eşleşti. Bu kanıt yeni paketin canlıda sunulduğunu doğrular; oturum açılmış senkron veya gerçek cihaz testi değildir.

En güncel arayüz ve yayın: [2.3 premium deneyim ve bütçe rotası](RELEASE_2_3.md).
