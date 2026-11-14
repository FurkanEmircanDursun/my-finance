# Mizan kimlik ve arayüz yenilemesi

Tarih: 14 Kasım 2026. Çalışma dalı: `feature/tokyo-1.0`. Paket sürümü: `2.5.0`; bu çalışma ayrıca bir mağaza sürümü üretmez.

## Sonuç ve kimlik

My Finance artık **Mizan** adını taşır. “Ayın dengesi, senin elinde.” fikri; özgün katlanmış M simgesi, mürekkep laciverti gezinme alanı, iris moru eylemler ve bütçe yüzeyiyle uygulanır. Marka varlıkları SVG kaynağından üretilir; web ikonları, manifest, Android launcher, bildirim ve açılış kaynakları güncellenmiştir. Ad değişikliği Android uygulama kimliğini veya verinin saklandığı kimlikleri değiştirmez.

## Deneyim

- Özet, kaydedilen gelir/gider/kalanı; bütçe alanı, görünür harcama grafiği, kategori dağılımı, son hareketler ve kart tarihleriyle bir araya getirir.
- Günlük ve birikimli grafik görünümleri, tooltip ve erişilebilir veri tablosu korunur.
- İlk açılışta örnek gelir seçimi, kira dahil etme kontrolü ve limit sürgüsü bütçe sonucunu etkileşimli gösterir. Örnek kayıtlar gerçek geçmişe yazılmaz.
- Gerçek kart/gelir/hatırlatma kurulumu atlanabilir. Mevcut kart ve bu ayki gelir yeniden tanınır; geçersiz tutar için görünür hata ve kapalı kaydetme eylemi bulunur.
- Gerçek kayıt eylemi örnek görünümden çıkar. Tutar ve kategori önde; diğer ayrıntılar isteğe bağlıdır. Geri alma, tutar gizliliği, açık/koyu tema ve azaltılmış hareket tercihleri devam eder.

## Mimari sınır

| Sorumluluk | Kaynak |
|---|---|
| Uygulama yaşam döngüsü, PIN ve kurulum kapıları | `frontend/src/app/App.tsx` |
| Kenar çubuğu ve üst çubuk | `frontend/src/app/WorkspaceChrome.tsx` |
| Aylık görünüm ve bağımsız örnek sunum modeli | `frontend/src/views/useOverviewModel.ts` |
| Ekran düzeni ve ayrıntı açılımları | `frontend/src/views/OverviewView.tsx` |
| Aylık limit ve erişilebilir kullanım göstergesi | `frontend/src/ui/BudgetRibbon.tsx` |
| Saklanan tutarı değiştirmeyen görüntü animasyonu | `frontend/src/ui/MoneyValue.tsx` |
| Ortak marka simgesi ve yazısı | `frontend/src/ui/Brand.tsx` |

Hesaplama motoru, banka adaptörleri, işlem şeması ve kuruş tamsayı modeli korunur. Kart borcu ödemesi yeniden gider sayılmaz; iade net gideri azaltır. Eski taksitlerin etkin ekstre tarihi ve tam belge mutabakatı aynı kurallarla çalışır. Aylık limit yalnız tek ay, tüm hesaplar ve başka etkin filtre yokken gösterilir. Kalan tutar bankadaki gerçek bakiye iddiası taşımaz.

IndexedDB adı `my-finance`, yedek formatı `my-finance/backup`, Android app ID `com.faraday.followfinance` ve mevcut Firebase/senkron kimlikleri değişmez. Yeni dışa aktarma dosyaları Mizan adını kullanır; eski yedekler desteklenir.

## Tasarım ve hareket

Çalışan sistem [DESIGN.md](../DESIGN.md) içinde makine tarafından okunabilir renk, tipografi, boşluk, köşe ve bileşen rolleriyle belgelenmiştir. `.impeccable/design.json` yalnız genişletilmiş hareket, gölge, breakpoint, bileşen önizlemesi ve anlatı bilgisini taşır.

Semantik renkler `styles/index.css`, ortak form/sheet davranışları `styles/premium.css`, çalışma alanı `styles/mizan.css`, kurulum `app/onboarding.css` içinde yaşar. Para değişimleri 480ms görüntü interpolasyonu, bütçe/örnek dağılımı 650ms, basma tepkisi 160ms kullanır. Azaltılmış hareket seçeneği animasyonları ve geçişleri kaldırır. Metin ve finansal sonuçlar hareketin tamamlanmasına bağımlı değildir.

## Doğrulama kaydı ve sınırlar

Yenileme öncesinde 453 frontend testi geçti. Kalıcılık düzeltmesini kapsayan beş regresyon testiyle son test çalıştırmasında 38 dosyada 458 testin tamamı geçti. Son `npm run build` çalıştırması TypeScript kontrolü ve 2517 modüllük Vite üretim derlemesiyle başarıyla tamamlandı. Önceden bulunan iki statik/dinamik import uyarısı derlemeyi engellemedi.

Yerel tarayıcı kontrolünde örnek gelir/kira etkileşimi, kurulumu atlama ve adımlar arasında ilerleme, geçersiz gelir girdisi, örnekten gerçek kayda geçişte boş geçmiş ve tutar/grafik gizliliği kontrol edildi. 125,50 TL test giderini kaydetme, geri alma ve hemen yenileme sonrasında sıfır gider/boş kayıt listesi doğrulandı. Bu kontrol sırasında bulunan IndexedDB önbellek bağlantısı ve anlık kalıcılık sorunu düzeltilerek beş regresyon testiyle kapsandı.

Masaüstü ve telefon yerleşimleri görsel olarak incelendi. Keskin tam sayfa kanıtlar 1440px masaüstü, 390px telefon, koyu temada 1440px kurulum ve 380px kurulum, ayrıca kullanıcının yaklaşık 458px görünümü için kaydedildi. Bağımsız görsel incelemede bulunan kenar çubuğu eylem kontrastı ana iris ve koyu hover rengine çekildi. Ekranlarda yalnız sentetik test/örnek verileri kullanılır.

İlk tasarım çalışmasında Firebase Hosting/Functions/rules yayını ve yeni APK üretimi yapılmadı. 7 Kasım tarihli Firebase ve Android belgeleri tarihsel altyapı bağlamıdır. Gerçek cihazda yükseltme, bildirim teslimi ve canlı Analytics alımı bu yerel tasarım kontrollerinden çıkarılamaz.

## 14 Kasım 2026 — Firebase Hosting yayını

Kullanıcının yayın talebiyle `my-finance-webapp-fd` projesinin mevcut Hosting sitesi güncellendi: https://my-finance-webapp-fd.web.app. Firebase CLI 15.20.0 ile `firebase deploy --only hosting --project my-finance-webapp-fd --non-interactive` tamamlandı; 48 derleme dosyası yayınlandı. Functions, Firestore kuralları ve indeksler bu dağıtımın kapsamında değildir.

Yayın öncesindeki güncel `npm run build` TypeScript ve Vite kontrollerini geçti. Yayın sonrasında HTML, favicon, manifest ve derlenmiş JS/CSS bağlantılarını kapsayan sekiz HTTP kontrolü 200 döndü; indirilen dosyalar yerel üretim çıktısıyla bayt düzeyinde eşleşti. Kanıt: [dağıtım doğrulaması](deployments/mizan-hosting-2026-11-14.json). Bu doğrulama canlı Google girişi, eşitleme veya cihaz bildirimi uçtan uca kabul testi değildir.
