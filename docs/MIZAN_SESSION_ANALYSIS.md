# Güvenli cihaz temizliği ve uzun dönem analiz

14 Kasım 2026. Kullanıcı hedefi: çıkışta yalnız cihaz verilerinin temizlenmesi; aynı ekranda uzun dönem finans ve varlık analizi. Mevcut Mizan tasarım sistemi ve önceki değişiklikler korunur.

## Kabul koşulları

1. Çıkış ve cihaz temizleme, bulut veya hesap silme API'sine erişmez. Bekleyen eşitleme, kimlik değişimi, başarısız çıkış ve yeniden girişte uzak kayıtlar korunur.
2. Cihazın finansal durumu ile eşitleme sahipliği/defteri atomik temizlenir. Başka sekme eski belleği diske veya buluta yazamaz. Açık taslaklar, eski Geri Al ve içe aktarma sonuçları kimlik/veri değişiminde sıfırlanır.
3. Bulut ve hesap silme, adı ve kapsamı açıkça ayrılmış ayrı onaylı işlemlerdir. PIN kurtarma da aynı güvenli cihaz sınırını kullanır.
4. Analiz; aylık trend, kategoriler ve değişimleri, işyeri/hafta günü alışkanlıkları, kesin değer tabloları, bugünkü varlıklar ve gerçek aylık varlık gözlemlerini tek rotada sunar.
5. Ödeme yeniden gider değildir. İadeler düşülür, tutarlar tamsayı kuruştur. Eksik ay sıfır değildir. Ekstre tarih kapsamı tüm hesapların eksiksizliği gibi sunulmaz.
6. Varlık geçmişi geriye dönük üretilmez. Tam ve güncel fiyatlarla aylık gözlem veya açıkça etiketli kullanıcının geçmiş ay toplamı kaydedilir. Değer farkı, yatırım getirisi diye adlandırılmaz.
7. Kaynak önceliği eldeki PDF ve ayrıştırılmış dosyalardır. Gerçek tutarlar ve kimlikler koda, paylaşılabilir ekran görüntülerine veya rapor çıktısına eklenmez. Canlı kullanıcı hesabı silinerek test yapılmaz.

## Kanıtlanan kök nedenler

- Oturum açıkken `reset`, eşitleme fark motoruna gerçek kayıt silmeleri olarak görünüyordu ve uzak tombstone üretebiliyordu.
- Çıkıştan kalan eski eşitleme defteri, boşaltılmış cihazı yeniden girişte uzak silme isteği gibi yorumlayabiliyordu.
- Başka sekmedeki eski bellek ve yaşam döngüsü kaydı, temizlenmiş IndexedDB durumunu geri yazabiliyordu.
- Kalıcı Geri Al ve form taslakları, sahiplik değişimi sonrası eski finansal veriyi yeniden ekleyebiliyordu.

Çözüm; merkezi oturum sınırı, eşitlemeyi durdurma, atomik cihaz durumu/defter temizliği, cihaz veri nesli kontrolü ve yalnız finansal içerik taşımayan sekmeler arası bildirimden oluşur. Gelecek Firestore erişimi bellek önbelleği kullanır; finansal dayanıklılığı uygulamanın kendi IndexedDB ve eşitleme defteri sağlar. Önceki kalıcı SDK önbelleği yerel temizleme sırasında kaldırılır.

## Eski açık sekmelerden güvenli geçiş

2.7 öncesindeki sekmeler cihaz veri neslini denetlemeden yazabiliyordu. Bu davranış gerçek IndexedDB işlemlerini taklit eden bağımsız eski istemciyle yeniden üretildi. Yeni sürüm, aynı `my-finance` veritabanının sürümünü 1'den 2'ye yükseltir; `kv` deposunu, finansal kayıtları ve diğer cihaz anahtarlarını dönüştürmez veya silmez.

Eski bağlantı yükseltmeyi bloke ederse yeni uygulama boş veriyle açılmaz ve temizlik tamamlanmış gibi davranmaz. Kullanıcıya diğer Mizan sekmelerini kapatıp yeniden yükleme yolu gösterilir. Yükseltmeden sonra eski sürümün 1 numaralı bağlantı isteği reddedilir. Yeni istemciler de sonraki sürüm değişimlerinde bağlantıyı kapatır ve eski bellekle yazmayı durdurur. Kalıcı kayıt kullanılamayan ortamda yalnız bellek kaydı başarı sayılmaz; görünür uyarı ve JSON yedekleme yolu korunur.

Geçiş yeniden yüklemeyle tekrar denenebilir; kesintide veriler korunur. Ürün arayüzü geri alınacaksa sürüm 2'yi ve nesil korumasını bilen veri erişim katmanı tutulmalıdır. Eski uygulamayı çalıştırmak için veritabanını silmek veya sürümünü düşürmek bu yayının geri alma yöntemi değildir.

## Analiz ve varlık gözlemleri

`#/analysis` bağımsız tarih aralığıyla tüm geçmişi, son 6/12 ayı veya kayıtlı yılı inceler. Harcama ayrıntıları mevcut `#/spending` rotasında kalır. Varlıkların bugünkü değeri, tarih aralığından bağımsız açıkça etiketlenir.

`buildLongitudinalAnalysis` tek hesaplama katmanıdır. Karşılaştırma son harcama ayı ve hemen önceki takvim ayıyla yapılır; boşluk atlanmaz. Pasta yalnız pozitif net kategorileri çizer; negatif iade kredileri ayrıca açıklanır. Aşırı büyük güvenli olmayan tutarlar bir hatayla durdurulur.

Profildeki `assetValuations`, en fazla 240 aylık gerçek gözlemi tutar. Miktar ve kaynak/tarih bilgili kur gözlemleri ile manuel geçmiş toplamları ayrılır. Eksik, eski veya önbellekten alınan fiyatla yeni otomatik tarihçe üretilmez. Eski istemcinin bilmediği alan mevcut tarihçeyi silmez; farklı cihazların gözlemleri ay/gün/zaman sırasıyla birleşir.

## Doğrulama kapsamı

Gerçek Axess PDF'si uygulamanın PDF çıkarıcı ve banka ayrıştırıcısıyla tamamen yerelde işlendi: 2 sayfa, 32 işlem (31 alışveriş, 1 ödeme), sıfır atlanan satır. On mutabakat/model değişmezi geçti. Finansal tutarlar ve kişi bilgileri yalnızca kullanıcının yerel dosyasında kaldı; kanıt özeti Git dışında `output/qa/longitudinal-private/` altındadır.

659 frontend testi (60 dosya), TypeScript ve üretim derlemesi geçti. Odaklı oturum/eşitleme testleri; gerçek IndexedDB işlem davranışını kullanan atomiklik, geri alma, iki bağımsız sekme nesli ve eski/yeni veritabanı sürümü geçişini de içerir. Bağımsız inceleme 52 kritik testi ayrıca doğruladı. Gerçek bir hesabı silme veya gerçek kullanıcı verisiyle bulut silme deneyi bu çalışmanın doğrulama yöntemi değildir.

Tarayıcı kabulü, Git dışında tutulan 60 sentetik işlem ve 10 varlık gözlemiyle yapıldı. Tüm geçmiş/son 6 ay ve kategori seçimi, pasta/trend grafikleri, manuel geçmiş değerinin `130.000,50` olarak kaydı ve yeniden yüklemede kalıcılığı doğrulandı. Masaüstü 1440 px ve mobil 390 px görsel kontrolü yapıldı; sayfa yatay taşmıyor, tablolar kendi içinde kayıyor.

İki gerçek tarayıcı sekmesiyle yerel temizlik doğrulandı: ikinci sekmede silme sonrası kalıcı Geri Al ve açık form taslağı bırakıldı. İlk sekmede yalnız cihaz temizlenince iki sekmenin finansal görünümü boşaldı, ikinci sekmedeki taslak ve Geri Al kaldırıldı. Yeniden yüklemede eski kayıtlar geri gelmedi. Görsel kanıtlar `output/qa/analysis-session/` altındadır. Üretim yayını aşağıda ayrıca kaydedilir.

## Üretim yayını

Mizan **2.7.0**, `my-finance-webapp-fd` Firebase Hosting hedefine 62 dosyayla yayınlandı. 14 Kasım 2026 **12:41:15 UTC** kontrolünde ana sayfa ve Analiz modülü HTTP 200 döndü. Yayındaki `/assets/app-DlITf36V.js` ile `AnalysisView-fX_s65c0.js` dosyalarının SHA-256 değerleri, son başarılı yerel üretim derlemesiyle birebir eşleşti. Makinece okunabilir kanıt: `output/qa/analysis-session/hosting-receipt.json`.

Remote Config'in 2 numaralı sürümünde `latest_version=2.7.0`, `min_required_version=0.0.0` ve mevcut web güncelleme adresi doğrulandı. Altı parametrenin tamamı yerel şablonla eşleşti; Android/iOS bağlantıları boştur. Bu son yayın yalnız Hosting'i değiştirdi; Functions veya Firestore kuralları yeniden yayınlanmadı.

Dönem seçicide yalnız işlem veya tarihli ekstre bulunan yıllar gösterilir; takvim arası yıllar ve boş mevcut yıl kendiliğinden eklenmez. Veri yokken yıl listesi açılmaz. Analiz ekranı da yalnız kayıtlı yılları sunar; varlık gözlemleri bu ekranın tarih kapsamına dahildir.

Yayın, canlı bir kullanıcı hesabında silme veya gerçek cihazda native kabul testi yapıldığı anlamına gelmez. Finansal silme sınırları otomatik testlerle, yerel davranış sentetik veriyle ve iki gerçek sekmeyle doğrulandı. Android/iOS paketleri bu web yayını kapsamında dağıtılmadı.
