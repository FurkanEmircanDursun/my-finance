# Teknik Mimari ve Dokümanlar

> Bu doküman, `docs/01` – `docs/05` arasındaki tüm parçalanmış dokümanları birleştirerek projenin tek teknik referans kaynağı olarak hizmet verir.

---

## İçindekiler

1. [Ürün Vizyonu ve Değer Önerisi](#1-ürün-vizyonu-ve-değer-önerisi)
2. [Kullanıcı Deneyimi (UX) Akışı](#2-kullanıcı-deneyimi-ux-akışı)
3. [Mimari Katmanlar](#3-mimari-katmanlar)
4. [Veri Akışı](#4-veri-akışı)
5. [Parser ve Kategori Motoru](#5-parser-ve-kategori-motoru)
6. [Görselleştirme Tasarımı](#6-görselleştirme-tasarımı)
7. [Finansal Sağlık Skoru](#7-finansal-sağlık-skoru)
8. [Veritabanı Şeması](#8-veritabanı-şeması)
9. [Güvenlik ve Gizlilik Modeli](#9-güvenlik-ve-gizlilik-modeli)
10. [Riskler ve Çözümler](#10-riskler-ve-çözümler)
11. [Gelecek Yol Haritası](#11-gelecek-yol-haritası)

---

## 1. Ürün Vizyonu ve Değer Önerisi

My Finance, standart bir gelir-gider takip uygulamasının ötesine geçerek **tamamen yerel (local-first)** çalışan, yapay zeka API'lerine bağımlı olmayan bir Kişisel Finans Yönetimi (PFM) platformudur.

### Temel Prensip: Zero-Knowledge (Sıfır Bilgi)

Kullanıcıların en mahrem finansal verilerini üçüncü parti sunuculara göndermeden, tarayıcı ve yerel sunucu ortamında işleyerek maksimum gizlilik sağlamak. Dosya asla diske yazılmaz; RAM'de okunur, parse edilir, sonuç JSON'a dönüştürülür, kaynak dosya garbage collector tarafından anında yok edilir.

### Farklılaştırıcı Özellikler

| Özellik | Mevcut Uygulamalar | My Finance |
|---------|-------------------|------------|
| Veri gizliliği | Veriler sunucuya yüklenir | Yerel işleme, sıfır kalıcı depolama |
| Analiz derinliği | Basit liste görünümü | 9 farklı görselleştirme + drill-down |
| Gelecek tahmini | Yalnızca geçmiş gösterilir | 6 aylık taksit projeksiyonu |
| Abonelik tespiti | Manuel | Otomatik (kural tabanlı algoritma) |
| Davranış yönlendirme | Yok | Nudge teorisi + Finansal Sağlık Skoru |

---

## 2. Kullanıcı Deneyimi (UX) Akışı

### Akış Şeması

```
Açılış Sayfası
    │
    ▼
[Dropzone] ── Ekstre (.txt) sürükle-bırak
    │
    ▼
Processing State (Animasyonlu)
    ├─ "Dosya okunuyor..."
    ├─ "İşlemler kategorize ediliyor..."
    └─ "Taksitler ve abonelikler hesaplanıyor..."
    │
    ▼
Dashboard
    ├─ KPI Kartları (Toplam, Top Kategori, Sağlık Skoru)
    ├─ Kategori Donut Chart  ──→ [tıkla] ──→ Transaction Drawer
    ├─ Merchant Treemap      ──→ [tıkla] ──→ Transaction Drawer
    ├─ Günlük Trend (Area Chart)
    ├─ Taksit Projeksiyonu (Stacked Bar, 6 ay)
    ├─ Gün Isı Haritası (Heatmap)
    ├─ Top 10 Merchant (Horizontal Bar)
    └─ Abonelik Paneli
```

### Tasarım Prensipleri

- **Progressive Disclosure:** Bilgi yoğunluğu kademeli olarak sunulur. Kullanıcı önce özet KPI'ları, sonra grafikleri, sonra ham verileri görür.
- **Drill-down:** Her grafik tıklanabilirdir. Kategoriye tıklamak, o kategorideki tüm ham işlemleri bir çekmece (drawer) içinde listeler.
- **Sürtünmesiz Yükleme:** Kayıt zorunluluğu yoktur. Ekstre yükle, analizi gör.

---

## 3. Mimari Katmanlar

```
┌─────────────────────────────────────────┐
│            Frontend (React + Vite)       │
│  ┌──────────┐  ┌────────────────────┐   │
│  │UploadPage│  │   DashboardPage    │   │
│  │ DropZone │  │  9 × Chart Bileşen │   │
│  └────┬─────┘  └────────┬───────────┘   │
└───────┼─────────────────┼───────────────┘
        │  HTTP (axios)   │
        ▼                 ▼
┌─────────────────────────────────────────┐
│           Backend (FastAPI)              │
│  POST /api/upload   POST /api/analyze    │
│  ┌──────────────────────────────────┐   │
│  │         services/analyzer.py     │   │
│  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │   parsers/ (akbank, garanti)     │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
        │
        ▼ (gelecek iterasyon)
┌─────────────────────────────────────────┐
│       PostgreSQL (Kalıcı Depolama)       │
│  users / transactions / categories /    │
│  custom_rules                           │
└─────────────────────────────────────────┘
```

### Teknoloji Seçimleri

| Katman | Teknoloji | Neden |
|--------|-----------|-------|
| Frontend | React 18 + Vite + TypeScript | Hızlı HMR, tip güvenliği, ekosistem zenginliği |
| Stil | Tailwind CSS | Utility-first, hızlı prototipleme |
| Grafikler | Recharts | React-native, composable, Treemap desteği |
| Animasyon | Framer Motion | Processing state mikro-animasyonları için |
| İkonlar | Lucide React | Hafif, tutarlı ikonografi |
| Backend | FastAPI (Python) | Async, Pydantic validasyon, otomatik API docs |
| HTTP | Uvicorn | ASGI, yüksek performanslı |

---

## 4. Veri Akışı

```
[.txt Dosya]
    │
    ▼ POST /api/upload (multipart/form-data)
[FastAPI: upload.py]
    │  RAM'de oku, banka tipini tespit et (Akbank/Garanti)
    ▼
[Parser: AkbankParser veya GarantiParser]
    │  Regex ile satır satır parse et
    ▼
[Categorizer: categorize_transaction()]
    │  CATEGORIES sözlüğüyle eşleştir
    ▼
[JSON Response]  ← İşlenmiş transaction listesi
    │
    ▼ POST /api/analyze
[FastAPI: analyze.py]
    │
    ▼
[Analyzer Service]
    ├─ category_totals()
    ├─ daily_trend()
    ├─ installment_projection()
    ├─ subscription_detection()
    ├─ top_merchants()
    ├─ weekday_heatmap()
    └─ health_score()
    │
    ▼
[AnalysisResult JSON] → Frontend → 9 Grafik Render
```

---

## 5. Parser ve Kategori Motoru

### Sınıf Hiyerarşisi

```python
BaseParser (ABC)
├── AkbankParser   # DD/MM/YYYY formatı, taksit desteği
└── GarantiParser  # DD Ay YYYY formatı, Türkçe ay isimleri
```

### Akbank Satır Formatı

```
05/07/2026 TRENDYOL.COM (1,065.00 TL) 3/2.taksit 355.00 355.00x1
│          │             │              │           │
Tarih      Açıklama      Toplam TL      Taksit No   Taksit Tutarı
```

**Regex'ler:**
- Tarih: `^(\d{2}/\d{2}/\d{4})`
- Taksit: `(\d+)/(\d+)\.taksit` → `current/total` formatına dönüştür
- İade: Tutarın sonundaki `(-)` işareti → negatif float
- Temizleme: `\([\d.,]+\s+TL(\s*\+Vade Farkı)?\)` → kaldır

### Garanti BBVA Satır Formatı

```
08 Ağustos 2026 A101 9923 I353 BAHÇELİEVL 0,09 788,50
│               │                           │     │
Tarih           Açıklama                    Bonus  Tutar
```

**Regex'ler:**
- Tarih: `^(\d{2}\s+[a-zA-ZğüşıöçĞÜŞİÖÇ]+\s+\d{4})`
- Tutar tespiti: Satır sonundan geriye doğru parse et. Sondan ikinci sayısal değer = Bonus, sonuncu = Asıl Tutar.
- Türk formatı: `788,50` → `788.50` (`replace('.','').replace(',','.')`)

### Kategori Motoru

```python
CATEGORIES = {
    "Market":           [r"MİGROS", r"A101", r"BİM", r"CARREFOUR", ...],
    "Yeme & İçme":      [r"UBER\s*EATS", r"YEMEKSEPETI", r"RESTORAN", ...],
    "Abonelik":         [r"NETFLIX", r"SPOTIFY", r"YOUTUBE", ...],
    "E-Ticaret":        [r"TRENDYOL", r"HEPSIBURADA", r"AMAZON", ...],
    "Fatura & Telekom": [r"TURKCELL", r"VODAFONE", r"İSKİ", ...],
    "Ulaşım & Araç":    [r"PETROL OFİSİ", r"OPET", r"BELBİM", ...],
    "Sağlık":           [r"ECZANE", r"HASTANE", r"MEDİCANA", ...],
    "Eğitim & Kitap":   [r"KİTAP", r"KIRTASİYE", ...],
    "Finans & Cüzdan":  [r"PAYCELL", r"MONEYPAY", r"IYZICO", ...]
}
```

**Algoritma:** `description.upper()` → her kategorideki her regex ile `re.search()` → ilk eşleşen kategorinin adını döndür → eşleşme yoksa `"Diğer"`.

**Kullanıcı Kuralları:** Kullanıcı UI'dan bir işlemin kategorisini değiştirdiğinde, bu kural `Custom_Rules` tablosuna yazılır ve bir sonraki analizde kategorizer önce özel kuralları kontrol eder.

---

## 6. Görselleştirme Tasarımı

### Grafik Kataloğu

#### KPI Kartları
Sayfanın en üstünde 3 büyük sayısal metrik:
- **Toplam Harcama:** Dönem içi pozitif tutarların toplamı (TL)
- **En Yüksek Kategori:** En fazla harcama yapılan kategori adı + tutarı
- **Finansal Sağlık Skoru:** 0–100 arası renk kodlu puan (Kırmızı < 40, Sarı 40–70, Yeşil > 70)

#### Kategori Donut Chart
- Ortada: Toplam dönem harcaması (TL)
- Dilimler: Her kategorinin yüzdesi
- Etkileşim: Dilime tıklandığında sağdan `TransactionDrawer` açılır, o kategorideki tüm işlemler listelenir

#### Merchant Treemap
- Alan büyüklüğü = harcama tutarı
- Renk = kategori
- İçeride: Merchant adı + tutar
- Etkileşim: Kutuya tıklandığında drawer açılır

#### Günlük Harcama Trend (Area Chart)
- X ekseni: Ayın günleri
- Y ekseni: Günlük harcama tutarı (TL)
- Özellik: 7 günlük hareketli ortalama çizgisi (benchmark)
- Tooltip: "Bu gün geçen haftaya göre %X daha fazla"

#### Taksit Projeksiyonu (Stacked Bar Chart)
- X ekseni: Önümüzdeki 6 ay
- Y ekseni: Toplam taksit yükü (TL)
- Renkler: Kategoriye göre (E-Ticaret = mavi, Sağlık = yeşil, vb.)
- Veri kaynağı: `installment` field'ından (`current/total`) kalan ay sayısı hesaplanır

#### Gün Isı Haritası (Heatmap)
- Matris: 7 gün (Pzt–Paz) × Haftalar
- Renk yoğunluğu: O günkü toplam harcama
- Analiz: "Hafta sonları daha mı çok harcıyorsunuz?"

#### Top 10 Merchant (Horizontal Bar Chart)
- En çok harcandığı 10 işyeri
- Etiket: İşyeri adı + toplam tutar + işlem sayısı

#### Abonelik Paneli
- Tespit algoritması: Aynı merchant, 25–35 gün arayla, ±%5 tutar toleransıyla tekrarlayan ödemeler
- Gösterim: Logo (favicon) + isim + aylık tutar + toplam yıllık maliyet
- Uyarılar: Tutar artışı tespit edilirse sarı rozet göster

#### Transaction Drawer
- Sağdan kayan panel
- Seçili kategorinin tüm ham işlemleri: Tarih | Açıklama | Taksit | Tutar
- Kategori değiştirme butonu (manuel override)

---

## 7. Finansal Sağlık Skoru

Kullanıcının harcama profilini 0–100 skalasında ölçen, bütçe yönetimi yeteneğini göstergeleyen puan sistemi.

```
Başlangıç Puanı: 100

DÜŞÜRÜCÜ FAKTÖRLER:
├─ Yeme & İçme oranı > %25 toplam harcama       → -15 puan
├─ Tekil abonelik oranı > %10 toplam harcama     → -10 puan
├─ Taksitli işlem oranı > %40 toplam harcama     → -20 puan
├─ E-Ticaret oranı > %20 toplam harcama          → -10 puan
└─ "Diğer" (kategorisiz) oranı > %15             → -5 puan

ARTIRICI FAKTÖRLER:
├─ İade (negatif tutar) bulunuyorsa              → +5 puan
└─ Hiç taksitli işlem yoksa                     → +10 puan

Skor Aralıkları:
  0 – 39  → 🔴 Kritik (Harcama kontrolü önerilir)
  40 – 69 → 🟡 Dikkatli (İyileştirme alanları var)
  70 – 100 → 🟢 Sağlıklı (Devam et!)
```

---

## 8. Veritabanı Şeması

> MVP'de PostgreSQL kullanılmaz; veriler session'da tutulur. Aşağıdaki şema kalıcı depolama iterasyonu için referanstır.

### `transactions`
```sql
CREATE TABLE transactions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID REFERENCES users(id),
    bank_name        VARCHAR(50) NOT NULL,          -- 'Akbank', 'Garanti'
    transaction_date DATE NOT NULL,
    raw_description  TEXT NOT NULL,
    amount           DECIMAL(12, 2) NOT NULL,       -- negatif = iade
    category_id      UUID REFERENCES categories(id),
    installment_current INT,                        -- 2 (2. taksit)
    installment_total   INT,                        -- 6 (6 taksit)
    created_at       TIMESTAMPTZ DEFAULT NOW()
);
```

### `categories`
```sql
CREATE TABLE categories (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES categories(id),       -- hiyerarşik
    name      VARCHAR(100) NOT NULL,                -- 'Market'
    icon      VARCHAR(50),                          -- 'shopping-cart'
    color     VARCHAR(7)                            -- '#22c55e'
);
```

### `custom_rules`
```sql
CREATE TABLE custom_rules (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id),
    keyword     VARCHAR(200) NOT NULL,              -- 'ÇAPARİ RESTAURANT'
    category_id UUID REFERENCES categories(id),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 9. Güvenlik ve Gizlilik Modeli

### Zero-Knowledge Prensibi

```python
# upload.py — Dosya hiçbir zaman diske yazılmaz
async def upload_statement(file: UploadFile):
    content = await file.read()          # RAM'e oku
    text = content.decode("utf-8")       # Decode et
    transactions = parser.parse(text)    # Parse et
    del content, text                    # Referansı sil
    return transactions                  # Sadece JSON döndür
```

### Veri Maskeleme

Ham satırlarda kart numarası veya IBAN gibi hassas veriler varsa, veritabanına yazmadan önce maskelenir:
```
4870 75** **** 4011
TR** **** **** **** **** **
```

### CORS Politikası
Backend yalnızca `localhost:5173` (geliştirme) ve dağıtım domain'inden gelen istekleri kabul eder.

---

## 10. Riskler ve Çözümler

| Risk | Olasılık | Etki | Çözüm |
|------|----------|------|-------|
| Banka ekstre formatını değiştirir | Orta | Yüksek | Fallback: parse edilemeyen satırı `"Tanımsız İşlem"` olarak kaydet; kullanıcıya uyar |
| Yeni merchant kategorize edilemiyor | Yüksek | Düşük | `Custom_Rules` tablosu: kullanıcı düzelttikçe sistem öğrenir |
| Taksit hesaplama hatası | Düşük | Orta | İade işlemleri (`-` tutarlı) ayrı hesaplanır; negatif tutar = toplam borca artı |
| Abonelik yanlış tespit | Orta | Düşük | Kullanıcı "Bu abonelik değil" diyebilir; kural false-positive listesine eklenir |
| Büyük ekstre dosyası (1000+ satır) | Düşük | Orta | Streaming parse + async FastAPI endpoint; UI'da skeleton loader |

---

## 11. Gelecek Yol Haritası

### Iterasyon 2
- [ ] PDF parsing (`pdfplumber` veya `pypdf2`)
- [ ] Kullanıcı hesapları (JWT auth)
- [ ] PostgreSQL kalıcı depolama
- [ ] Çoklu ekstre yükleme (birden fazla ay karşılaştırma)

### Iterasyon 3
- [ ] İş Bankası, Yapı Kredi parser adaptörleri
- [ ] Bütçe limitleri ve proaktif uyarılar
- [ ] Gamification: Tasarruf serileri (streak sistemi)
- [ ] Peer-to-peer benchmark (anonimleştirilmiş karşılaştırma)

### Iterasyon 4 — Open Banking
- [ ] BDDK Open Banking API entegrasyonu
- [ ] Otomatik ekstre çekme (kullanıcı onayıyla)
- [ ] Gerçek zamanlı harcama bildirimleri
