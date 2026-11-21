# Varlık fiyatları: kaynak ve hesaplama kaydı

Kontrol tarihi: 14 Kasım 2026, 13:26 (Europe/Istanbul). Bu belge sağlayıcı seçimini ve doğrulanan davranışı kaydeder; fiyatlar sabit uygulama verisi değildir.

## Canlı kaynak

[Truncgil Finans](https://finans.truncgil.com/) kendi sayfasında ücretsiz JSON uç noktalarını yayımlar. Kullanılan [v4 uç noktası](https://finans.truncgil.com/v4/today.json) anahtar istemez; gerçek HTTP kontrolünde `200` ve `Access-Control-Allow-Origin: *` döndü. Sağlayıcının [ürün sayfası](https://truncgil.com/urun-hizmet/truncgil-finance) kimlik doğrulamasız geliştirici planını açıklar. Uygulama yalnız herkese açık fiyat isteği gönderir; varlık miktarı, kullanıcı kimliği ve finansal kayıtlar isteğe eklenmez.

`HAS`, `GUMUS`, `USD`, `EUR` içindeki pozitif sayısal `Buying` ve `Selling` alanlarının ortalaması alınır. `Update_Date` Türkiye saati olarak ayrıştırılır. Ters makas, sıfır, metin değer, geçersiz tarih, gelecekteki tarih ve yedi günden eski veri reddedilir. Örneğin kaynaktaki `ONS: 0` değeri kullanılmaz.

Gerçek servis doğrulaması `npx --no-install vite-node scripts/verify-rates-live.ts` ile başarılı oldu. 13:26:01 tarihli beş fiyatın tamamı Truncgil üzerinden geldi: gram has altın 6.248,63 TL; çeyrek metal değeri yaklaşık 10.046,02 TL; gram gümüş 79,14 TL; USD 50,3656 TL ve EUR 55,5598 TL. Bunlar yalnız kontrol anının herkese açık kaynak sonuçlarıdır.

## Bağımsız yedekler

[Frankfurter v2](https://frankfurter.dev/) ücretsiz ve anahtarsız referans döviz/metal fiyatları sağlar. [USD bazlı TRY, EUR, XAU ve XAG sorgusu](https://api.frankfurter.dev/v2/rates?base=USD&quotes=TRY,EUR,XAU,XAG) gerçek kontrolde `200` ve CORS erişimi döndürdü. XAU/XAG oranı USD başına troy ons olduğundan ters çevrilir; gram hesabında 31,1034768 gram/troy ons kullanılır. Sonuçlar kaynak günleriyle birlikte günlük referans olarak etiketlenir; kesin saat uydurulmaz.

[ExchangeRate-API açık uç noktası](https://www.exchangerate-api.com/docs/free) döviz için üçüncü kaynaktır. [USD bazlı veri](https://open.er-api.com/v6/latest/USD) gerçek kontrolde `200` ve CORS erişimi döndürdü. Ücretsiz açık kaynak günlük güncellenir, önbelleğe izin verir ve kaynak bağlantısı ister. Ekrandaki hesaplama açıklamasında sağlayıcının istediği “Rates By Exchange Rate API” bağlantısı bulunur.

Gold API'nin belgeleri ücretsiz spot/CORS desteği belirtse de `api.gold-api.com` TLS sertifikası bu ortamda geçersizdi. Metals.live TLS hatası, goldprice.org uç noktası `403` döndürdü. Bu kaynaklar üretim zincirine alınmadı; TLS doğrulaması zayıflatılmadı.

## Değerleme sınırı

[Darphane'nin Cumhuriyet altını standardı](https://www.darphane.gov.tr/cumhuriyet-altini-uretimi) çeyreklik ziyneti 1,754 gram ve 916,6 milyem olarak verir. Saf içerik `1,754 × 0,9166 = 1,6077164 gram`dır. Ekrandaki çeyrek tutarı bu metal miktarına dayanır; sikke çeyreğin 1,804 gram standardı kullanılmaz. Kulp, işçilik, prim ve alım/bozum makası dahil değildir. Alım veya bozum teklifi olarak sunulmaz.

Miktarlar altı ondalık basamaklı tamsayı mikro birimle tutulur; toplam TL değeri hesaplamanın sonunda kuruşa yuvarlanır. Fiyatı olmayan varlık sıfır kabul edilmez: portföy toplamı eksik olarak işaretlenir ve fiyatlanabilen bölüm ayrıca gösterilir. Varlık kayıtları harcama veya gelir oluşturmaz.

## Ağ, önbellek ve kontroller

- Tek seferde bir yenileme; eşzamanlı çağrılar aynı Promise'i paylaşır.
- Kaynak başına 7 saniye zaman aşımı; arka planda periyodik ağ isteği yoktur.
- Kullanıcı yenilemesinde en az 60 saniye ara; normal açılışta 5 dakika cihaz önbelleği.
- Yedi gün yaş sınırı; önbellek, eski veri ve günlük yedek kaynaklar görünür biçimde etiketlenir.
- Yenileme süresi yalnız ayrı performans izni açıksa, parametresiz `quote_refresh` süresi olarak ölçülür.

Alan ve servis testleri miktar doğruluğu, geçersiz yedek temizliği, eksik toplam, para yuvarlama, sağlayıcı şeması, saat dilimi, ters kur dönüşümü, zaman damgası, hata/önbellek, çağrı birleştirme ve istek sınırını kapsar. Tarayıcıdaki kullanıcı akışı ana görevde ayrıca doğrulanır.
