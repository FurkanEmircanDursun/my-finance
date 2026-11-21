# Mizan UX, kart yaşam döngüsü ve varlıklar

Kaynak: kullanıcının 5 fazlı isteği ve `goal-objective.md`. Tasarım dili Mizan; öncelik seçili dönemle tutarlı, tek dokunuşla anlaşılır mobil akışlardır.

## Uygulama sırası ve kabul kanıtları

1. **Dönem ve temel UX.** Kayıt tarihi seçili aydan başlar; açık tarih seçimi daima esas alınır. Gelir/gider satırında görünür silme ve geri alma. Yıl ardından ay seçimi boş bir geçmiş aya da kayıt eklemeyi sağlar. Ayarlar `#/settings` tam sayfadır; kartlar `#/cards`, kart detayı `#/cards/{id}` rotasındadır. Kanıt: tarih/sınır regresyon testleri, gezinme testleri ve mobil form/silme/geri alma kontrolleri.
2. **Kart ve ekstre yaşam döngüsü.** Seçili dönem için kimliği ayrı tutulan kartlar, gerçek kart kapsamıyla detay; kesim günü geçmiş eksik ekstre uyarısı ve doğrudan ekle/kartı kaldır eylemleri. İçe aktarımda bilinmeyen kartı izinle kaydetme. Cihaz/FCM gün sonu hatırlatmaları, izin ve tekrar gönderim koruması. Kanıt: aynı bankada iki kart, eski ay, kısa ay, kesim öncesi/sonrası ve aynı gün tekrar kontrol testleri.
3. **Firebase ürün katmanı.** Remote Config sürüm politikası, çevrimdışı varsayılan/önbellek, geçerli URL ve sürüm doğrulaması, zorunlu/önerilen güncelleme. Mevcut Auth/Firestore/Analytics/FCM korunur; yararlı ölçüm ve hata servisleri açık rızayla çalışır. Remote Config canlı şablonu mevcut değerler korunarak hazırlanır; doğrulanmış Android mağaza/APK adresi gelmeden kullanıcılar zorunlu güncellemeyle kilitlenmez. Kanıt: sürüm/politika/önbellek testleri; gerçek sağlayıcı ve canlı cihaz kabulü ayrı yazılır.
4. **Varlıklarım.** Gram/çeyrek altın, gümüş, USD/EUR miktar ekleme/düzenleme/silme; finansal kayıtlarla karışmayan kalıcı model, yedek/geri yükleme ve mevcut eşitleme sınırları. Ücretsiz gerçek sağlayıcı, ikincil kaynak ve tarihli önbellek; fiyat yoksa uydurma toplam gösterilmez. Kanıt: birim/dönüşüm/toplam testleri, sağlayıcı çağrısı, çevrimdışı ve hata kontrolleri, mobil portföy akışı.
5. **Teslimat.** Uygun frontend/backend testleri, TypeScript ve üretim derlemesi; mobil/masaüstü görsel kontrol. `output/pdf/mizan-mimari-ve-urun-raporu.pdf`: yapılanlar, kalan riskler, özellik yol haritası ve projeye özel Firebase rehberi. PDF sayfaları render edilip incelenir. Sonuçlar doğrulama kapsamıyla raporlanır.

## Değişmezler

- IndexedDB adı, Android uygulama kimliği, mevcut finans kayıtları ve yedek formatı uyumluluğu korunur.
- Finansal tutarlar kuruş tamsayısıdır; kart borcu ödemesi tekrar gider değildir.
- Örnek kayıtlar gerçek geçmişe yazılmaz. Varlık miktarı ve kur fiyatı finansal işlem olarak sayılmaz.
- Gizlilik tercihleri genişletilmez; hiçbir telemetri finansal tutar, varlık miktarı, kart veya ekstre içeriği taşımaz.
- Yapılmamış cihaz/sağlayıcı/doğrudan canlı kabul testleri geçti olarak sunulmaz.

## Tamamlama kanıtı

14 Kasım 2026: 572 frontend testi, 11 sunucu bildirim testi, TypeScript ve üretim derlemesi geçti. Tarih değişikliği, silme/geri alma, iki aşamalı dönem, tam sayfa ayarlar, kart kayıt/eksik ekstre/detay ve varlık CRUD akışları sentetik verilerle tarayıcıda doğrulandı. Mobil 390 px ve masaüstü 1440 px görsel kontrolü yapıldı. Zorunlu/isteğe bağlı güncelleme ve ayrı ölçüm izni çalıştı; test geçersiz kılmaları geri alındı.

Hosting 2.6.0 ve kullanıcı onaylı Remote Config sürüm 1 yayındadır. Canlı sürüm, kur yanıtı ve sabit ölçüm belgesi tarayıcıda doğrulandı. Son yayın ve kabul sınırları `docs/RELEASE_2_6.md` içindedir. Gerçek cihaz bildirim teslimi, native geri tuşu/yerinde yükseltme, eşzamanlı hesaplı cihaz kabulü ve sağlayıcı panel alımı yerel testlerden sonuçlandırılmaz.
