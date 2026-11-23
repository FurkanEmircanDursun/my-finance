# Firebase maliyet denetimi · 22 Kasım 2026

Ekran görüntüsünde Firestore ₺9,00, Functions ₺3,70, toplam ₺12,70. Görüntü hizmet toplamlarını verir. SKU ve kredi dökümü olmadan bu tutarlar okuma, işlemci, ağ veya başka bir faturalanan kalemle kesin eşleştirilemez.

Cloud Monitoring `firestore.googleapis.com/document/read_count` ölçümünde 14 Kasım UTC günü `QUERY` türünde 351.006 okuma kaydedildi. 1–21 Kasım aralığındaki diğer günlük noktalar en fazla 4.169 okuma gösterdi. Aynı günlük serilerde en yüksek yazma 1.511, silme 1.134. Monitoring günleri UTC, ücretsiz kota ise Pasifik saatine göre yenilenir. Bu nedenle metrikler doğrudan fatura mutabakatı sayılmaz.

Firestore Standard günlük 50.000 okuma, 20.000 yazma ve 20.000 silme ücretsiz kotası sunuyor. Realtime Database indirme hacmini protokol ek yüküyle birlikte ölçüyor. Normal günlerin ölçülen kullanımı ve mevcut UID ayrımı, sorgular, tombstone ve çoklu cihaz eşitlemesi birlikte değerlendirildiğinde Firestore’u korumak daha düşük riskli. Realtime Database’e geçişin daha ucuz olacağına dair karşılaştırılabilir indirme verisi yok. [Firestore fiyatlandırması](https://firebase.google.com/docs/firestore/pricing) · [Realtime Database fiyatlandırması](https://firebase.google.com/pricing)

## Uygulanan değişiklikler

- İstemci ilk sunucu sonucu beklenirken açık Firestore dinleyicisini yeniden kullanır. Ağ geri gelince SDK’nın kendi yeniden bağlantısı çalışır. Terminal dinleyici hatasında yeni abonelik oluşturulur. Kalıcı yetki ve geçersiz yazım hataları otomatik tekrar döngüsünden çıkar. Hesap değişiminde temizlenen oturum belleği korunur.
- Sorgulanmayan beş profil alanı, işlem ham metni ve atlanan ekstre satırları için tek alan indeksleri devre dışı. Saatlik push sorgusu ve teslim kaydı temizliğinin koleksiyon grubu indeksleri korunur.
- Zamanlayıcı aynı sayfada bir hesabın kartlarını ve tercihlerini bir kez okur. Alan maskesi finansal profilin gereksiz bölümlerini indirmez. Geçmiş teslim kayıtlarının boş sorgusu normalde günde 24 yerine bir kez çalışır. Toplu temizlik tavanı günde 4.800 kayıt olarak kalır. Boş başarılı çalışmalarda uygulama özet kaydı atlanır.
- Mizan projesinde 34 bölgede tek Scheduler görevi bulundu. Aynı faturalandırma hesabına bağlı dört projede toplam dört görev var. Saatlik Mizan görevi, kullanıcıların seçebildiği tüm saatleri kapsıyor. Diğer üç görev ayrı projelere ait. Üç ücretsiz görev hakkı faturalandırma hesabında paylaşılır. [Cloud Scheduler fiyatlandırması](https://cloud.google.com/scheduler/pricing)
- `europe-west1/gcf-artifacts` deposu sorgulandığında 111.771.494 bayttı. Bir günlük etkin imaj temizleme politikası mevcut. [Firebase işlev imajı temizleme](https://firebase.google.com/docs/functions/manage-functions)

Gerçek tasarruf, dağıtım sonrası Firestore sorgu okumaları, fatura SKU’ları ve işlev kullanımının karşılaştırılmasıyla ölçülür. Bu çalışma testlerin gösterdiği işlem azalmasını fatura tasarrufu olarak saymaz.

## Mizan 2.9.1

- Varsayılan açılış, en yeni işlem ve taksit tarihini iki küçük sorguyla bulur. İşlemler seçili ayın tarih aralığıyla sınırlanır. Satın alma tarihi ve taksit yansıtma tarihi ayrı sorgulanır. Bir satır iki sorguya da girerse uygulamada tek kayıt olarak birleştirilir ve Firestore iki okuma ölçebilir.
- Başka bir aya geçince o ayın hareketleri, ekstre detayında yalnızca o ekstrenin satırları alınır. Açılmış kapsamlar oturum belleğinde tekrar kullanılır. Çok dönemli analiz, tam yedekleme ve yeni dosya aktarımında tüm hareketler istek üzerine yüklenir. Ekstre üst bilgileri, profil ve kategori kuralları açılışta eşitlenir.
- PDF’nin SHA-256 parmak izi dosya okunurken cihazda hesaplanır. Hesapta parmak izi varsa normal tekrar aktarım dosya adı değişse bile ayrıştırmaya veya OCR’a geçmez ve finansal kayıt yazmaz. Kullanıcı ekstre detayında uyuşmazlığı gidermek için açıkça düzeltme seçerse aynı dosyayı tekrar işleyebilir. Eski kayıtlar ilk başarılı yeniden aktarımda parmak izi kazanır.
- Web ve Capacitor için oturumla sınırlı bellek önbelleği kullanılır. Finansal kayıtlar için kalıcı Firestore IndexedDB önbelleği açılmadı. [Firestore çevrimdışı önbelleği](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- Hosting ana adresi ve `index.html` her açılışta yeniden doğrulanır. İçerik karması dosya adına eklenen varlıklar bir yıl önbellekte kalabilir. [Firebase Hosting önbelleği](https://firebase.google.com/docs/hosting/manage-cache)

### 1.000 günlük aktif kullanıcı için okuma modeli

Her kullanıcının günde bir kez açtığı, eski sistemin açılışta 1.500 belge, yeni sistemin aylık açılışta 100 belge okuduğu ve tam geçmiş açıldığında mevcut ay dahil 1.500 ek belge okuduğu varsayılmıştır. Ay 30 gün, günlük ücretsiz kota 50.000 okuma, fiyat duyarlılığı 100.000 ücretli okuma başına 0,03–0,06 USD, örnek kur 50 TL/USD. Hesap yalnızca belge okumalarını kapsar. [Firestore fiyatlandırması](https://firebase.google.com/docs/firestore/pricing)

| Kullanım | Günde belge okuması | Aylık okuma tahmini |
| --- | ---: | ---: |
| Eski tam açılış | 1.500.000 | ₺653–1.305 |
| Yeni, herkes aylık açılışta kalır | 100.000 | ₺23–45 |
| Yeni, oturumların %10’u tam geçmiş açar | 250.000 | ₺90–180 |
| Yeni, oturumların %25’i tam geçmiş açar | 475.000 | ₺191–383 |

Ay başına işlem ve ekstre başlığı sayısı, bağlantı kopmaları, iki tarih sorgusunun ortak sonuçları ve tam geçmişin açılma oranı gerçekleşen okumayı belirler. Ağ, disk, yazma, Functions, Hosting ve vergiler modele dahil değildir.
