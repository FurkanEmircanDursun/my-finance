# My Finance — Akıllı Kişisel Finans Asistanı

> Kredi kartı ekstreni sürükle, harcamalarını anında analiz et.

## Ne Yapar?

**My Finance**, Akbank ve Garanti BBVA ekstrelerinizi (`.txt`) sürükleyip bırakmanızla birlikte otomatik olarak:

- Tüm işlemleri **kategorize eder** (Market, Yeme & İçme, Ulaşım, vb.)
- **9 farklı görsel analiz** üretir (Donut, Treemap, Heatmap, Stacked Bar…)
- **Aboneliklerinizi** tespit eder
- **Taksitlerinizin** önümüzdeki 6 aydaki yükünü hesaplar
- **Finansal Sağlık Skoru** (0–100) çıkarır

Tüm veriler **yerel (local-first)** işlenir — hiçbir veri sunucuya kalıcı olarak kaydedilmez.

---

## Proje Yapısı

```
my-finance/
├── README.md
├── PRD.md
├── docs/
│   └── ARCHITECTURE.md       # Teknik mimari ve dokümanlar
├── parsers/                   # Python parse motorları
│   ├── base_parser.py
│   ├── akbank_parser.py
│   ├── garanti_parser.py
│   ├── categorizer.py
│   └── main.py
├── backend/                   # FastAPI REST API
│   ├── requirements.txt
│   ├── main.py
│   ├── routers/
│   │   ├── upload.py
│   │   └── analyze.py
│   └── services/
│       └── analyzer.py
├── frontend/                  # React + Vite arayüzü
│   ├── package.json
│   └── src/
│       ├── App.tsx
│       ├── pages/
│       └── components/
└── data/                      # Örnek ekstre dosyaları ve JSON çıktıları
```

---

## Hızlı Kurulum

### Gereksinimler
- Python 3.10+
- Node.js 18+

### 1 — Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Backend `http://localhost:8000` adresinde çalışmaya başlar.  
API dokümantasyonu: `http://localhost:8000/docs`

### 2 — Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend `http://localhost:5173` adresinde açılır.

### 3 — Parser'ları Tek Başına Çalıştırmak (Opsiyonel)

```bash
cd parsers
python main.py          # Parse eder → data/ klasörüne JSON yazar
python categorizer.py   # Kategorize eder → *_categorized.json üretir
```

---

## API Endpoint'leri

| Method | Path | Açıklama |
|--------|------|----------|
| `POST` | `/api/upload` | Ekstre `.txt` dosyası yükle, parse edilmiş işlemleri al |
| `POST` | `/api/analyze` | İşlem listesi gönder, tüm analiz metriklerini al |
| `GET`  | `/api/health` | Backend sağlık kontrolü |

---

## Desteklenen Bankalar

| Banka | Format | Taksit Desteği |
|-------|--------|----------------|
| Akbank | `.txt` (DD/MM/YYYY) | ✅ |
| Garanti BBVA | `.txt` (DD Ay YYYY) | ❌ (Garanti ekstrelerinde taksit bilgisi yok) |

Yeni banka eklemek için `parsers/base_parser.py`'den türetilmiş yeni bir sınıf yeterlidir.

---

## Teknik Detaylar

→ Detaylı mimari, veri akışı ve risk analizi için bkz. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
