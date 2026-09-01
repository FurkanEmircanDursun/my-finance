# Ürün Gereksinim Dokümanı (PRD) — My Finance MVP

> **Versiyon:** 1.0 | **Tarih:** Ağustos 2026 | **Durum:** Geliştirme aşamasında

---

## 1. Problem Tanımı

Kullanıcılar, kredi kartı ekstrelerinde onlarca satır ham veri ile karşılaşır; ancak bu veriyi anlamlandırmak için zaman, araç veya finansal bilgi gerekmektedir. Mevcut uygulamalar ya verilerinizi buluta göndererek gizliliği ihlal eder, ya da yalnızca geçmiş verileri göstererek gelecek planlamayı zorlaştırır.

## 2. Çözüm

**My Finance**, kredi kartı ekstrelerini (`.txt`) sürükle-bırak yöntemiyle alır, tamamen yerel (local-first) bir şekilde parse eder ve kullanıcıya 9 farklı interaktif görselleştirme sunar.

## 3. Temel Özellikler (MVP Kapsamı)

| # | Özellik | Öncelik | Durum |
|---|---------|---------|-------|
| 1 | Sürükle-bırak ekstre yükleme (.txt) | P0 | ✅ |
| 2 | Akbank & Garanti parser motorları | P0 | ✅ |
| 3 | Kural tabanlı kategorizasyon | P0 | ✅ |
| 4 | Kategori Donut Chart + Drill-down | P0 | ✅ |
| 5 | Merchant Treemap | P1 | ✅ |
| 6 | Günlük Harcama Trend Grafiği | P1 | ✅ |
| 7 | Taksit Projeksiyonu (6 ay) | P1 | ✅ |
| 8 | Abonelik Tespiti | P1 | ✅ |
| 9 | Haftanın Günleri Isı Haritası | P1 | ✅ |
| 10 | Top 10 Merchant Sıralaması | P1 | ✅ |
| 11 | Finansal Sağlık Skoru (0–100) | P1 | ✅ |
| 12 | PDF desteği | P2 | ❌ Sonraki iterasyon |
| 13 | Kullanıcı hesapları | P2 | ❌ Sonraki iterasyon |

## 4. Kullanıcı Profili

**Birincil Kullanıcı:** 25–40 yaş arası, teknoloji ile barışık, finansal bilinç sahibi olmak isteyen Türkiye'deki banka kartı kullanıcısı.

**Temel İş Akışı:**
1. Ekstreni indir (Akbank veya Garanti internet bankacılığından)
2. My Finance'e sürükle
3. Analiz ekranlarını incele
4. İçgörüleri değerlendir, gerekirse kategoriyi düzelt

## 5. Başarı Metrikleri (MVP)

- Parse doğruluk oranı: > %95 (tanınan işlem / toplam işlem)
- Yükleme → Dashboard süresi: < 5 saniye (500 satırlık ekstre için)
- Kullanıcı memnuniyeti (NPS): > 40

## 6. Kapsam Dışı (v1)

- PDF parsing (karmaşık ve banka bazında farklılık gösterir)
- Gerçek zamanlı Open Banking API entegrasyonu
- Mobil native uygulama
- Çoklu kullanıcı / paylaşım özellikleri
- Makine öğrenimi tabanlı kategorizasyon

## 7. Teknik Gereksinimler (Özet)

| Katman | Teknoloji |
|--------|-----------|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS |
| Grafikler | Recharts (Donut, Area, Bar, Treemap) |
| Backend | FastAPI (Python 3.10+) |
| Parse motoru | Kural tabanlı Regex (no LLM dependency) |
| Güvenlik | In-memory processing, zero persistent storage |

---

> Detaylı teknik mimari, veri akışı, DB şeması ve risk analizi için bkz. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
