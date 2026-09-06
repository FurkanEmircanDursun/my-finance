# My Finance

Kredi kartı ekstrenizi tarayıcıda okuyup analiz eden kişisel finans aracı. Dosyalar cihazınızdan çıkmaz; ayrıştırma, sınıflandırma ve tüm analiz tarayıcıda çalışır, veriler IndexedDB'de yerel olarak saklanır.

```bash
cd frontend
npm install
npm run dev          # http://localhost:3003
```

Taranmış (metin katmanı olmayan) PDF'ler için isteğe bağlı yerel OCR servisi:

```bash
pip install -r backend/requirements.txt
python backend/main.py     # http://127.0.0.1:8005
```

Servisi Ayarlar bölümünden etkinleştirin. Kapalıyken taranmış PDF'ler tarayıcı içi OCR ile okunur.

---

## Ne yapar

Beş bölüm. İlki tek başına yeterli; gerisi derinleşmek isteyene.

| Bölüm | İçerik |
|---|---|
| **Özet** | Dönemi tek cümlede özetler, üç sayı verir (ay sonu tahmini, gelecek ay bağlı tutar, sağlık skoru) ve en önemli üç bulguyu gösterir |
| **Harcamalar** | Brüt/iade/net ayrımı, aylık seri ve limit takibi, kategori tablosu, aylar arası hareket edenler, işyerleri, "küçük ama sık" alışkanlıklar, haftalık ritim |
| **Düzenli ödemeler** | Periyot bandı tespiti, tutar istikrarı, güven skoru, fiyat artışı, sonraki tahsilat, durmuş abonelikler |
| **Gelecek** | Açık taksit planları, 12 aylık bağlı tutar merdiveni, gelire oran |
| **İşlemler** | Arama, sıralama, toplu kategori atama (kural olarak öğrenir), manuel kayıt, CSV dışa aktarım |

Ayrıca **Bulgular** (tüm sıra dışı işlemler, mükerrer çekimler, açıklamalı sağlık raporu), **Ekstreler** ve **Ayarlar** — özetteki bağlantılardan ve üst çubuktan erişilir.

## Desteklenen kaynaklar

- **Akbank / Axess** — `.txt` ve `.pdf`
- **Garanti BBVA / Bonus** — `.txt` ve `.pdf`
- **Genel CSV** — başlık satırında tarih ve tutar sütunu olan her dışa aktarım

Akbank PDF'leri ana bilgisayarda üretiliyor ve metin katmanı EBCDIC kodlu geliyor; uygulama bunu doğrudan çözer, OCR'a gerek kalmaz. Her iki banka için de gerçek ekstrelerle doğrulandı: ayrıştırılan net tutar, ekstrenin kendi "Dönem Borcu" rakamıyla kuruşu kuruşuna örtüşüyor.

Yeni bir banka eklemek: `src/ingest/banks/` altına bir adaptör dosyası yazıp `src/ingest/banks/index.ts` içindeki `ADAPTERS` dizisine ekleyin. Boru hattının geri kalanında değişiklik gerekmez.

## Komutlar

```bash
npm run dev         # geliştirme sunucusu
npm run build       # tip kontrolü + üretim derlemesi
npm run typecheck   # yalnızca tip kontrolü
npm test            # birim testleri (vitest)
```

## Mimari

Ayrıntı için [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

```
src/
  core/        para (kuruş tamsayı), tarih, istatistik, metin, hash
  domain/      tipler ve kategori tek kaynağı
  ingest/      metin çıkarma, banka adaptörleri, sınıflandırma, boru hattı
  analytics/   tek geçişli analiz motoru ve modülleri
  store/       reducer, IndexedDB kalıcılık, seçiciler
  ui/          tasarım sistemi ilkelleri, grafik sarmalayıcıları
  views/       bölüm ekranları
  app/         kabuk, gezinme, filtre çubuğu, tema
```

## Gizlilik

- Hiçbir işlem verisi ağa çıkmaz. Uygulamada uzak API çağrısı yoktur.
- Yerel OCR servisi yalnızca siz açtığınızda ve yalnızca `127.0.0.1` üzerinde çalışır; hiçbir şeyi diske yazmaz.
- Veriler tarayıcınızın IndexedDB'sinde durur. Ayarlar bölümünden JSON yedeği alabilir veya tamamen silebilirsiniz.

> **Not:** Depoda gerçek ekstre içerikli örnek dosyalar (`frontend/*.txt`, `data/*.json`) bulunuyor. Bunlar geçmiş commit'lerde de yer aldığı için depoyu paylaşacaksanız önce temizlemeniz gerekir.
