# My Finance — UI Yeniden Tasarım Planı

> Versiyon: 1.0 · Tarih: 2026-09-01  
> Hedef: Uygulamayı, glassmorphism kalabalığından arındırılmış, **Linear / Vercel / Stripe** benzeri sade, bilgi yoğun ama temiz bir finans arayüzüne dönüştürmek.

---

## 1. Mevcut Durumun Tespiti — Neler Yanlış?

### 1.1 Tasarım Sistemi Sorunları (`index.css`)

| Sorun | Detay | Etki |
|---|---|---|
| **Çok fazla glow efekti** | `.glow-green`, `.glow-indigo`, `.glow-amber`, `.glow-red` — 4 farklı glow | Görsel gürültü |
| **Animasyon aşırı yüklemesi** | `shimmer`, `float`, `pulse-glow`, `spin-slow` — 4 animasyon tanımlanmış ama anlamsız | Dikkat dağıtıcı |
| **Glassmorphism yanlış kullanım** | `backdrop-filter: blur(12px)` her kartta; gerçek glassmorphism için altında içerik olmalı | Performans + gereksiz karmaşıklık |
| **Renk tutarsızlığı** | CSS değişkenleri (`--accent`) ile Tailwind sınıfları (`from-indigo-500`) mixlenmiş | Bakımı zor |
| **`body` background radial-gradient** | İki radial gradient body'e gömülmüş — kaydırınca yanlış görünüyor | Estetik sorun |
| **Typography çok küçük** | `card-label` = 11px uppercase; `section-title` = 13px uppercase + letter-spacing aşırı agresif | Okunabilirlik düşük |

### 1.2 Upload Sayfası Sorunları (`UploadPage.tsx`)

| Sorun | Detay |
|---|---|
| **Hero alanı gereksiz büyük** | Büyük H1 + subtitle + pill badge + dropzone = fazla hiyerarşi katmanı |
| **Features grid gereksiz** | Upload sayfasında "Sıfır Bilgi", "Anlık Analiz" vs. özellik kartları — kullanıcı PDF yüklemek için geldi |
| **Pill badge anlamsız** | `"Tamamen yerel · Yapay zeka gerektirmez"` — hover/tıklama durumu yok, "neden burada?" hissi |
| **Mevcut + bekleyen dosyalar karışık** | Yüklenmiş dosyalar ve bekleyen dosyalar aynı alanda ayrım belirsiz |
| **Footer gereksiz** | "My Finance · Sıfır-Bilgi Prensibi · Açık Kaynak" — bu bilgi başka yerlerde de var |
| **Aşırı animasyon** | Her element için `motion.div` ile ayrı fade-in + delay; gözü yoruyor |

### 1.3 Dashboard Sayfası Sorunları (`DashboardPage.tsx`)

| Sorun | Detay |
|---|---|
| **KPI hiyerarşisi zayıf** | 4 kart eşit görünüyor; "Toplam Harcama" öne çıkmıyor |
| **Nakit Akışı bölümü anlamsız** | Tek aylık bir ekstreden geliyorsa income yok; bölüm çoğunlukla boş |
| **Kategori tablosu + Donut çakışıyor** | Donut zaten kategori dağılımını gösteriyor; alttaki tablo içerik tekrarı |
| **8 bölüm peş peşe** | Sonsuz scroll, bilgi mimarisi yok |
| **`section-title` overuse** | Her kartta tekrar eden UPPERCASE etiket; tipografik monotonluk |
| **Sıfırla butonu tehlikeli** | Veri kaybı riski, onay adımı yok |

### 1.4 Dashboard Bileşen Sorunları

#### `CategoryDonut.tsx`
- Recharts `Legend` çok yer kaplıyor, özelleştirilmemiş
- "Dilime tıklayarak işlem detaylarına ulaşın" — metni görüntülemek zorunda kalmak zayıf UX işaretidir

#### `SpendingTreemap.tsx`
- Donut ile içerik tekrarı (aynı veriyi farklı biçimde gösteriyor)
- Küçük kutulardaki metinler görünmüyor
- Karmaşık `buildTreemapData` hiyerarşisi görsel çıktıda fark edilmiyor

#### `TopMerchants.tsx`
- Recharts yatay BarChart **mobilde tamamen bozuluyor** (`YAxis width={120}` + uzun isimler)
- Bar + label + tooltip üçünde aynı bilgi tekrarlanıyor

#### `WeekdayHeatmap.tsx`
- Her bar altında aynı anda 3 satır bilgi (gün + ₺tutar + işlem sayısı) → görsel tıkanıklık
- Hover tooltip da aynı bilgileri tekrarlıyor

#### `InstallmentRadar.tsx`
- İsim yanıltıcı: "Radar" ama `BarChart` kullanılıyor
- Alttaki mini month grid = grafikteki bilginin tekrarı

#### `TransactionDrawer.tsx`
- 100+ işlem varken her kayıt için `motion.div` animasyonu performansı düşürüyor
- Arama/filtreleme yok

#### `ProcessingState.tsx`
- 5 sabit step gösteriliyor ama `statusMessage` dinamik → hangisindeyiz belirsiz
- 3 iç içe dönen halka aşırı animasyon

---

## 2. Referans Tasarım Hedefi

**Benchmark:** Linear, Vercel Dashboard, Stripe Dashboard  
**Anahtar kelimeler:** _minimal, data-dense, purposeful, confident_

### 2.1 Yeni Renk Sistemi

```
Arka Plan:     #0a0a0a   (saf siyah — solid, glassmorphism değil)
Surface:       #111111   (hafif elevated)
Surface 2:     #1a1a1a   (border'lı kartlar)
Border:        #262626   (nötr)
Metin Ana:     #ededed
Metin İkincil: #737373
Metin Pasif:   #404040

Vurgu Yeşil:   #22c55e   (pozitif / income / başarı)
Vurgu Kırmızı: #ef4444   (harcama / uyarı)
Vurgu Mavi:    #3b82f6   (interaktif / seçili)
Vurgu Mor:     #8b5cf6   (taksit)
```

> **Neden solid siyah?** Mevcut `#080c14` lacivert-siyah glassmorphism'i zorunlu kılıyor. Saf `#0a0a0a` Linear/Vercel'de kanıtlanmış; her grafik rengini daha canlı gösterir.

### 2.2 Yeni Tipografi Hiyerarşisi

```
Page Title:    24px / 600 / #ededed     (tek seferlik, sayfa başı)
Card Heading:  13px / 500 / #737373     (UPPERCASE kalkıyor!)
KPI Value:     32px / 700 / #ededed     (tabular-nums)
KPI Sub:       13px / 400 / #737373
Body:          14px / 400 / #a3a3a3
Small:         12px / 400 / #525252
```

> **Neden UPPERCASE kalkıyor?** 11px+uppercase+letter-spacing üçlüsü hem küçük hem agresif. 13px/500 weight daha okunabilir ve modern.

---

## 3. Değişim Planı — Dosya Bazlı

### 3.1 `src/index.css` — Tam Yeniden Yazım

**Kaldırılacaklar:**
- `body` üzerindeki `background-image: radial-gradient(...)` → Solid renk
- `.glow-green`, `.glow-indigo`, `.glow-amber`, `.glow-red` sınıfları
- `.animate-float`, `.animate-shimmer`, `.animate-pulse-glow`, `.animate-spin-slow`
- `backdrop-filter: blur(12px)` → Solid background ile değiştir

**Eklenecekler:**
- `--color-*` CSS custom properties (yukarıdaki renk paleti)
- Yeni `.card` = `background: #111; border: 1px solid #262626; border-radius: 12px`
- `.metric-value` (32px, tabular-nums)
- Tek bir `@keyframes fadeIn`

### 3.2 `src/pages/UploadPage.tsx` — Sadeleştirilmiş Upload

**Layout Değişimi:**
```
ÖNCE:
  Header → Hero (büyük H1 + pill) → Upload Card → Features Grid → Footer

SONRA:
  Tam merkeze hizalı tek kart (max-w-md, hiç scroll yok)
    ↳ Küçük logo + "My Finance"
    ↳ Compact dropzone (tek satır açıklama)
    ↳ Dosya listesi (inline)
    ↳ CTA butonu
    ↳ 1 satır gizlilik notu
```

**Kaldırılacaklar:**
- Features Grid (4 özellik kartı)
- Hero bölümü (H1 + subtitle + pill badge)
- Footer
- Her element için ayrı `motion.div`

### 3.3 `src/pages/DashboardPage.tsx` — Bilgi Mimarisi

**Layout Değişimi:**
```
ÖNCE (8 section, linear scroll):
  Header → KPIs → Health Detail → Nakit Akışı →
  Donut+Treemap → DailyTrend → Heatmap+TopMerchants →
  Installment → Subscriptions → Category Table

SONRA (5 section, grouped):
  ┌─ Header (minimal: logo + dosya bilgisi + eylemler) ─┐
  ├─ [ÖZET] 3 KPI horizontal (Toplam / İade / Net)      ─┤
  ├─ [ANALİZ] Donut + DailyTrend (yan yana, 2 sütun)    ─┤
  ├─ [DAVRANIŞLAR] TopMerchants + WeekdayHeatmap (2 sütun)─┤
  ├─ [TAKSİTLER] — Sadece veri varsa render edilir       ─┤
  ├─ [ABONELİKLER] — Sadece veri varsa render edilir     ─┤
  └─ [TÜM İŞLEMLER] İnline expandable tablo             ─┘
```

**Kaldırılacaklar:**
- `SpendingTreemap` bileşeni ve kullanımı
- `Nakit Akışı` progress bar bölümü → KPI satırına dahil
- `Kategori Özet Tablosu` → Donut drawer'ında zaten var
- `showHealthDetail` toggle → Popover ile değiştir
- `AnimatePresence` section animasyonları → Tek mount fade-in

### 3.4 `CategoryDonut.tsx`
- Recharts `Legend` kaldır → Alt kısımda manuel legend listesi (renk + isim + tutar)
- "Dilime tıklayarak..." hint metni kaldır
- Aktif kategori drawer header'ında bold olarak gösterilsin

### 3.5 `WeekdayHeatmap.tsx`
- Bar altındaki 3 satırdan sadece **gün adı** kalsın
- ₺tutar ve işlem sayısı yalnızca **hover tooltip**'te gösterilsin
- Mount sırasında bar yüksekliği 0→gerçek değer animasyonu

### 3.6 `TopMerchants.tsx` — Recharts → Pure CSS Liste

```
ÖNCE: Recharts BarChart (mobilde bozuk)

SONRA:
  #1  TRENDYOL.COM   ████████████████░   ₺3.420   12 işlem
  #2  A101            ██████████░░░░░░░   ₺1.840    8 işlem
```

Pure CSS progress bar → Mobil uyumlu, Recharts dependency'si gerekmez.

### 3.7 `InstallmentRadar.tsx`
- Bileşen adı `InstallmentProjection` olarak değiştir
- Alttaki mini month grid kaldır (grafik zaten gösteriyor)
- Veri yoksa `null` dön → Section da otomatik gizlenir

### 3.8 `ProcessingState.tsx`
- 5 sabit step listesi kaldır
- `statusMessage` büyük font ile merkez; tek sade spinner

### 3.9 `TransactionDrawer.tsx`
- `motion.div` animasyonları kaldır (performans)
- Header altına gerçek zamanlı arama input ekle

---

## 4. Silinecek Bileşenler

| Bileşen | Neden | Alternatif |
|---|---|---|
| `SpendingTreemap.tsx` | Donut ile içerik tekrarı, karmaşık ve mobilde sorunlu | `CategoryDonut` yeterli |
| `KpiCards.tsx` | Dashboard içinde inline render edilebilir | Dashboard içine taşı |
| `HealthScoreBadge.tsx` | Tek satır inline ile halledilebilir | Dashboard içine taşı |

---

## 5. Eklenecek Özellikler

### 5.1 Tarih Filtresi (Öncelik: Yüksek)
```
Dashboard header altı:
  [Tüm Dönemler ▾]  [Ağu 2026 ▾]  [Tem 2026 ▾]
  Seçimde sadece o aya ait işlemler filtrele
```

### 5.2 Arama — TransactionDrawer'da (Öncelik: Orta)
```
Header altında:
  [🔍 İşlem veya mağaza ara...]
  Gerçek zamanlı filtre
```

### 5.3 Kategori Düzenleme (Öncelik: Düşük)
Kullanıcı yanlış kategorize edilmiş işlemi Drawer'dan tıklayarak düzeltebilsin.

---

## 6. Responsive İyileştirmeler

| Mevcut Sorun | Çözüm |
|---|---|
| `TopMerchants` BarChart mobilde bozuluyor | Pure CSS list ile değiştir |
| Dashboard header'da dosya bilgisi `hidden md:flex` | Mobilde `{n} ekstre` kompakt badge |
| Donut 300px her zaman → mobilde çok yer kaplıyor | Mobil: 220px, tablet+: 280px |
| `TransactionDrawer` `max-w-[440px]` — küçük ekranda tam ekran değil | `max-w-full sm:max-w-[440px]` |
| `section-title` uppercase 13px mobilde zor okunuyor | 14px, uppercase kaldır |
| KPI `grid-cols-2 lg:grid-cols-4` — tabletde garip | `grid-cols-1 sm:grid-cols-3` |

---

## 7. Performans İyileştirmeleri

| Sorun | Çözüm |
|---|---|
| Her bileşende ayrı `fmt` fonksiyon tanımı | `src/utils/format.ts` merkezi dosya |
| `framer-motion` `AnimatePresence` her yerde | Sadece Drawer ve modal için tut |
| `TransactionDrawer` 100+ işlem animasyonu | Animasyonsuz render veya 50'li pagination |
| Tesseract OCR main thread'i donduruyor | Web Worker içine taşı |
| `SpendingTreemap` gereksiz ağır hesaplama | Sil |

---

## 8. Uygulama Öncelik Sırası

### 🔴 Kritik (İlk Yapılmalı)
1. `index.css` yeni renk sistemi + glassmorphism kaldır
2. `UploadPage` sadeleştir (features grid + hero sil)
3. `TopMerchants` → Pure CSS liste
4. `ProcessingState` sadeleştir
5. `SpendingTreemap` sil → Dashboard'dan çıkar

### 🟡 Önemli
6. `DashboardPage` layout yeniden düzenlemesi
7. `WeekdayHeatmap` sadeleştir (3 satır → 1 + tooltip)
8. `TransactionDrawer` animasyon kaldır + arama ekle
9. `InstallmentRadar` alt grid kaldır + rename

### 🟢 İyileştirme (Zaman olunca)
10. Tarih filtresi
11. `utils/format.ts` merkezi format fonksiyonları
12. Tesseract Web Worker
13. Kategori düzenleme özelliği

---

## 9. Özet Karşılaştırma

| Alan | Şu An | Hedef |
|---|---|---|
| Arkaplan | `#080c14` + 2 radial gradient | `#0a0a0a` solid |
| Kartlar | Glassmorphism + blur | Solid `#111` + `#262626` border |
| Animasyon | 6+ farklı animasyon tipi | Sadece 1 fade-in |
| Glow efektleri | 4 renk glow | 0 |
| Bileşen sayısı | 12 dashboard bileşeni | 9 (3 silindi) |
| Upload sayfası | 3 bölüm (hero + upload + features) | 1 bölüm (tek kart) |
| Dashboard scroll | Sonsuz, 8 section | Grouped, 5 section |
| Typography | 11px uppercase | 13-14px normal weight |
| Mobil uyum | Kısmen bozuk | Tam responsive |
| Tarih filtresi | Yok | Eklenecek |
| Arama | Yok | Eklenecek |
