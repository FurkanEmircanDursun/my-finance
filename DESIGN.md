---
name: Mizan
description: "Ay Özeti, işlemler ve ekstreler için kişisel finans arayüzü."
colors:
  bg: "#f6f5f0"
  bg-raised: "#fffefa"
  bg-sunken: "#eeeee7"
  bg-hover: "#e9ede5"
  bg-active: "#dce3d9"
  line: "#dce3d9"
  line-strong: "#929e94"
  text: "#202925"
  text-muted: "#4c5c52"
  text-faint: "#536359"
  text-inverse: "#fffefa"
  accent: "#155a4d"
  accent-hover: "#104639"
  accent-soft: "#e4eee8"
  accent-text: "#155244"
  positive: "#286345"
  positive-soft: "#e9f2e9"
  negative: "#a03236"
  negative-soft: "#faeaea"
  warning: "#7d4f10"
  warning-soft: "#fbf0dc"
  grid: "#e2e7de"
  dark-bg: "#171f1b"
  dark-bg-raised: "#202b25"
  dark-bg-sunken: "#26322b"
  dark-bg-hover: "#2b3830"
  dark-bg-active: "#35483d"
  dark-line: "#3b4b42"
  dark-line-strong: "#72867a"
  dark-text: "#f1f4ed"
  dark-text-muted: "#c0cec3"
  dark-text-faint: "#a7baad"
  dark-text-inverse: "#171f1b"
  dark-accent: "#a4d8c1"
  dark-accent-hover: "#b5e7d1"
  dark-accent-soft: "#293d34"
  dark-accent-text: "#c4e8d6"
  dark-positive: "#9fdabb"
  dark-positive-soft: "#243b30"
  dark-negative: "#f29797"
  dark-negative-soft: "#442b2a"
  dark-warning: "#f3c379"
  dark-warning-soft: "#3b3123"
  dark-grid: "#2b3830"
typography:
  page-title:
    fontFamily: "DM Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 720
    lineHeight: 1.14
    letterSpacing: "-0.036em"
  phone-title:
    fontFamily: "DM Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 720
    lineHeight: 1.14
    letterSpacing: "-0.036em"
  section-title:
    fontFamily: "DM Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "-0.018em"
  amount:
    fontFamily: "DM Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.16
    letterSpacing: "-0.025em"
  body:
    fontFamily: "DM Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: "DM Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: ".875rem"
    fontWeight: 650
    lineHeight: 1.5
    letterSpacing: "0"
rounded:
  control: "12px"
  panel: "16px"
  compact-control: "8px"
spacing:
  control-gap: "8px"
  desktop-gutter: "36px"
  tablet-gutter: "18px"
  phone-gutter: "14px"
  month-work-gap: "28px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.text-inverse}"
    rounded: "{rounded.control}"
    padding: "0 18px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.bg-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "44px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.accent-text}"
    rounded: "{rounded.control}"
    height: "44px"
  input:
    backgroundColor: "{colors.bg-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "44px"
  panel:
    backgroundColor: "{colors.bg-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
    padding: "8px 18px"
  navigation-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-text}"
    rounded: "{rounded.control}"
    height: "46px"
  remainder:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
    padding: "18px 20px"
  statement-recovery:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning}"
    padding: "12px 20px"
---

# Mizan tasarım sistemi

## Ay merkezli düzen

Mizan, kaydedilen ayın durumunu ilk ekranda dört açık tutarla gösterir. Ay Özeti, İşlemler, Kartlar ve Analiz her iki yerleşimde aynı sırada. Varlıklar, Gelecek ve harcama ayrıntıları Analiz’den açılır. Ayarlar masaüstünde yan menünün sonunda, telefonda üst çubukta. Hesap ve senkronizasyon, dönem seçici ve tutarları gizleme ilgili bağlamda üst çubuktan erişilir.

Ay merkezli yön ile iş merkezli yön aynı sentetik kayıtlarla masaüstünde ve dar telefonda beş görev için 13’er eylem gerektirdi. Ay merkezli yön, ayın durumunu doğrudan gösterdiği için eşitlik kuralıyla seçildi.

**Tasarım ilkeleri**

- Önce kişinin sorduğu tutarı ve o tutarın kaynağını göster.
- İlişkili ayrıntıları ilgili ekrandan aç. Günlük gezinme dört hedefle sınırlı kalsın.
- Birincil eylemler ve seçili durumlar için koyu yeşil, doğrulama ve hatalar için metinle birlikte durum rengi kullan.
- Katlanmış M, Türkçe DM Sans Variable ve tabular rakamlar ürün kimliğini taşır.

## Finansal etiketler

| Etiket | Ekrandaki anlamı |
| --- | --- |
| Kaydedilen gelir | Seçilen kapsamdaki gelir kayıtları |
| Net harcama | Harcama eksi iadeler, kart borcu ödemeleri hariç |
| Gelirden kalan | Kaydedilen gelir eksi net harcama. Gelir kaydı yoksa çizgi görünür. |
| Bankanın dönem borcu | Seçili ayda kesilmiş ve borcu okunmuş ekstrelerde yazan tutar. Tüm dönemler görünümünde kullanıcı borç için bir ay seçer. |
| Kart detayındaki net harcama | O kartın seçili takvim ayına ait kayıtları. Ekstrenin belge kapsamı ayrı gösterilir. |

Takvim ayı ve ekstre mutabakatı kendi kapsamlarında hesaplanır. Ekstre detayında bankanın dönem borcu, son ödeme tarihi ve doğrulama durumu başta yer alır. Tutarlar uyuşmuyorsa okunan fark TL olarak belirtilir ve aynı kart seçilerek dosya yeniden açılabilir. Satırlar tür başlıkları ve ara toplamlarla bölünür. Ekstre hesabı, belge alanları ve bonus hareketleri ayrıca erişilebilir.

## Yerleşim ve bileşenler

- Masaüstünde 204 px sabit yan menü, 1160 px içerik sınırı ve 36 px içerik kenar boşluğu kullanılır. 1023 px ve altında yan menü 170 px, kenar boşluğu 23 px olur. Ay Özeti’nde tutarlar tek yatay satırda, son işlemler ve ekstreler iki sütundadır.
- 800 px altında alt gezinme ve ortada 44 px işlem eylemi kullanılır. 640 px altında metrikler dikey satırlara, ekstre ayrıntıları tek sütuna geçer. Üst ve alt çubuklar güvenli alanı, sayfa da odak gezinmesi için çubukların yüksekliğini hesaba katar.
- Masaüstünde sayfa başlığı 36 px, telefonda 30 px. Ana tutar 30 px, işlem satırları 14–15 px, destek metni 13–14 px. Temel kontrol köşesi 12 px, panel köşesi 16 px. İçerik yüzeylerinde çizgi veya ton, diyalog ve geri bildirim katmanlarında yumuşak gölge kullanılır.
- İşlem Ekle, gelir/gider seçimini, tutarı ve gider kategorilerini gösterir. Açıklama, tarih ve ödeme yöntemi **Ayrıntılar** içinde açılır. Kaydetme koruması tekrarlanan dokunuşları önler. Geri al, kapatılana veya başka bir sonuç gösterilene kadar erişilebilir.
- PDF seçimi, sürükle bırak ve cihaz paylaşımı aynı içe aktarma iş akışını kullanır. İşlem sırasında dosya adı ve ayrıştırıcının bildirdiği aşama görünür. Hata ve dosya seçimi aynı panelde sürer. Başarılı sonuçtan kaydedilen ekstre açılabilir.
- Analiz zaman aralığını bağımsız seçer ve grafiklerle birlikte sayısal değerleri erişilebilir tutar. Varlıklarda miktar, fiyat zamanı ve değer ayrı gösterilir. Gelecek ödemeler, taksitler ve hedefler için ayrı bir görünüm sunar. Ayarlar hesap, görünüm, yedek ve cihaz seçeneklerine erişim sağlar.
- Girişteki örnek bütçe yalnızca deneme içindir. Örnek kayıtlar cihazın finansal geçmişine yazılmaz. Gerçek kayda geçerken örnek görünüm kapanır.

## Hareket ve erişilebilirlik

| Değişken | Değer | Kullanım |
| --- | --- | --- |
| `--motion-press` | 120 ms | Basma tepkisi |
| `--motion-reveal` | 160 ms | Ay verileri ve açılan kartın başlığı |
| `--motion-sheet` | 220 ms | Sheet, kayıt sonucu ve bütçe çubuğu |
| `--ease-out-quick` | `cubic-bezier(.23, 1, .32, 1)` | Hızlı başlayıp yavaşlayan geri bildirim |

Ay değişiminde gezinme ve dönem seçici sabit kalır. Geçişler hesap, kaydetme veya gezinme akışını bekletmez. Azaltılmış hareket tercihinde seçim, odak ve işlem sonucu metinle görünmeye devam eder.

Diyaloglar destekleyen tarayıcılarda yerel `showModal()` kullanır. Eski WebView’lerde klavye odağını ve arka plan ayrımını sağlayan yedek uygulanır. Android geri tuşu önce etkin diyalogdan çıkar. iOS sayfa hareketi WKWebView geçmişine bağlıdır ve diyalog kapalıyken etkindir. Gerçek tarayıcı geçmişinde sayfa değiştiğinde, önceki sayfanın diyalogları kapanır. Klavye için görsel viewport kullanılır. Tablolar başlıklarını korur ve yatay kaydırma gerektiğinde klavyeyle ulaşılabilir.

`frontend/src/styles/index.css` çalışma anındaki semantik renk ve hareket değişkenlerini, `workspace.css` responsive bileşimi, `frontend/src/ui/modal.css` diyalog davranışının görsel kurallarını tanımlar. Düzenlenebilir prototip teslimindeki üç bileşen ve token’lar sentetik finans verisiyle hazırlanmıştır.
