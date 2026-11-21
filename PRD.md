# Ürün Gereksinim Dokümanı — My Finance

> **Versiyon:** 2.2 · **Tarih:** Ekim 2026 · **Durum:** Geliştirmede

---

## 1. Problem

Kredi kartı ekstresi onlarca ham satırdır. Kullanıcı bu satırlardan üç soruya cevap arar ve hiçbirini ekstreden okuyamaz:

1. Param nereye gidiyor?
2. Önümüzdeki ay ben hiçbir şey yapmasam bile ne kadar ödeyeceğim?
3. Bu ayda alışılmadık bir şey oldu mu?

Mevcut uygulamalar ya veriyi buluta mecbur bırakır ya da yalnızca geçmişi tablolar; ikisi de bu soruları yanıtlamaz.

## 2. Çözüm

Ekstre tarayıcıya bırakılır, cihazdan çıkmadan ayrıştırılır ve beş bölümlük bir analiz olarak sunulur. Uygulama geçmişi göstermekle kalmaz; tekrarlayan yükleri, bağlı gelecek ödemeleri ve sıra dışı hareketleri açıkça isimlendirir.

## 3. Kapsam

### 3.1 Tamamlandı (v2)

| # | Özellik | Öncelik |
|---|---|---|
| 1 | Sürükle-bırak içe aktarma: PDF, TXT, CSV | P0 |
| 2 | Akbank ve Garanti BBVA adaptörleri + genel CSV adaptörü | P0 |
| 3 | Akbank'ın EBCDIC kodlu PDF'lerinin doğrudan çözülmesi (OCR gerekmez) | P0 |
| 3b | Gerçek tarama PDF'leri için OCR (isteğe bağlı yerel servis, tarayıcı içi yedek) | P1 |
| 4 | 18 kategorili kural tabanlı sınıflandırma + kullanıcı düzeltmelerinden kural öğrenme | P0 |
| 5 | Kalıcı yerel depolama (IndexedDB), çoklu ekstre birleştirme, yinelenen eleme | P0 |
| 6 | Küresel dönem/banka/arama filtresi | P0 |
| 7 | Nakit akışı: brüt/iade/net ayrımı, aylık seri, doğrusal eğim + R² | P1 |
| 8 | Ay sonu projeksiyonu ve limit takibi | P1 |
| 9 | Düzenli ödeme tespiti: periyot bandı, tutar istikrarı, güven skoru | P1 |
| 10 | Fiyat artışı ve durmuş abonelik tespiti | P1 |
| 11 | Taksit planları ve 12 aylık bağlı tutar merdiveni | P1 |
| 12 | Zorunlu / karma / isteğe bağlı harcama ayrımı | P1 |
| 13 | Sıra dışı işlem tespiti (robust z-skor, iki taban) | P1 |
| 14 | Olası mükerrer çekim tespiti | P1 |
| 15 | "Küçük ama sık" alışkanlık analizi ve yıllık karşılığı | P1 |
| 16 | Aylar arası kategori hareketleri | P1 |
| 17 | Bileşen bazlı, açıklanabilir sağlık skoru | P1 |
| 18 | Öncelik sıralı bulgu motoru | P1 |
| 19 | Toplu kategori atama, manuel işlem, CSV/JSON dışa aktarım | P1 |
| 20 | Açık/koyu tema, mobil uyum | P2 |
| 21 | Üç sekmelik sadeleştirilmiş gezinme; özet ekranı tek bakışta okunabilir | P0 |
| 22 | Sütun-farkında PDF okuma: bonus/chip-para sütunundaki rakam harcama sayılmaz | P0 |
| 23 | Ekstre mutabakatı: ayrıştırılan tutar, bankanın kendi aritmetiğiyle (dönem borcu = önceki bakiye − ödemeler + harcamalar) kuruşu kuruşuna karşılaştırılır; fark Özet'te söylenir | P0 |
| 24 | Taksit planı doğruluğu: ekstre ayına göre yerleşim, bankanın "kalan taksit" sayısı, her ayın taksiti ayrı satır | P0 |
| 25 | Geçmiş ve veri ekranı: dönem → ekstre → mutabakat → sayılmayan satırlar; dönem/ekstre bazında silme | P1 |
| 26 | Tam JSON dışa aktarma (ham satır, taksit, döviz, bonus, ekstre özeti, mutabakat, kurallar, profil, dönem özetleri) ve yedekten geri yükleme (birleştir / değiştir); eski yedekler okunur | P0 |
| 27 | Şema göçü: sürüm yükseltmesi veriyi silmez, taşır; bulut senkronu da göç ettirir | P0 |
| 28 | `npm run verify`: gerçek ekstreyi aynı kodla okuyup bankanın toplamıyla karşılaştıran komut | P2 |
| 29 | İsteğe bağlı hesap: Google ya da tek formla e-posta (giriş dener, yoksa oluşturmayı/şifre sıfırlamayı sunar); hesapsız kullanım tam işlevli kalır | P0 |
| 30 | Firestore senkronu: belge başına son yazan kazanır, silme mezar taşıyla taşınır, çevrimdışı düzenleme kaybolmaz; PIN ve ekstre dosyaları asla gitmez | P0 |
| 31 | Senkron durumu üst çubukta tek simge; cihazda başka hesabın verisi varsa sessiz birleştirme yerine açık seçim | P1 |
| 32 | Hesap ve bulut verisi silme (kimlik yeniden doğrulanır); çıkış yerel veriyi korur | P1 |
| 33 | Erişilebilirlik: metin kontrastı WCAG AA, odak yönetimi, grafik eksen etiketleri | P1 |
| 34 | Ekstre seçimi: dönem + kart = bir ekstre; ekranın tamamı o ekstreye göre değişir | P0 |
| 35 | Ekstre hesabı Özet'te: önceki bakiye − ödemeler + harcamalar = bankanın dönem borcu; harcamanın borca neden eşit/eşit olmadığı bir cümleyle söylenir | P0 |
| 36 | Her listenin satırları üstündeki rakama kuruşu kuruşuna toplanır (kategoriler, iade ve indirimler, "Diğer" dahil); ekstre detayında her satır bölümlere ayrılıp toplanır | P0 |
| 37 | Bonus ve puan: kazanılan (otomatik fatura bonusu, kampanya, alışveriş), harcanan, kalan; Garanti Bonus ve Akbank Chip-para; harcamaya katılmaz | P1 |

### 3.2 Kapsam dışı

- Open Banking / gerçek zamanlı hesap bağlantısı
- Paylaşım, birden çok kullanıcı, aile/ortak hesap (senkron yalnızca tek kişinin kendi cihazları içindir)
- Ekstre dosyalarının bulutta saklanması (yalnızca ayrıştırılmış kayıtlar eşitlenir)
- Yatırım tavsiyesi veya portföy takibi
- Makine öğrenimi tabanlı sınıflandırma (kural tabanlı yaklaşım denetlenebilir ve çevrimdışıdır)

## 4. Kullanıcı

25–45 yaş, Türkiye'de kredi kartı kullanan, verisini buluta vermek zorunda kalmak istemeyen ama telefonu ile bilgisayarında aynı tabloyu görmek isteyebilen, finansal farkındalık arayan kişi. Bulut varsayılan değil, bilinçli bir seçimdir.

**Akış:** ekstreyi indir → sürükle → genel bakışta bulguları oku → yanlış kategorileri düzelt (kural olarak öğrenilir) → yükümlülükler ve düzenli ödemeleri incele.

## 5. Başarı ölçütleri

| Ölçüt | Hedef | Nasıl doğrulanır |
|---|---|---|
| Ayrıştırma doğruluğu | Ayrıştırılan net tutar = ekstrenin kendi aritmetiğinin gerektirdiği tutar (fark ₺0,00) | Her içe aktarmada otomatik: ekstre kartında "Ekstreyle kuruşu kuruşuna tutuyor" ya da farkın kendisi. Gerçek Akbank ve Garanti ekstreleriyle, birden çok ayda doğrulandı; okunamayan satır 0 |
| Geçmişin bütünlüğü | Aynı ekstreyi yeniden yüklemek ve yedekten geri yüklemek satırı çoğaltmaz, hiçbirini düşürmez | `history.test.ts`, `migrate.test.ts` (üç aylık taksit senaryosu, v2 → v3 kimlik denkliği) |
| Sınıflandırma kapsamı | "Diğer" payı < %15 | Genel bakışta ve bulgularda raporlanır |
| Düzenli ödeme kesinliği | Yanlış pozitif ≈ 0 | Üç kapılı tespit; testlerle sabitlendi |
| İçe aktarmadan panoya | 500 satırlık TXT için < 2 sn | Tek geçişli motor, memoize analiz |
| İlk yükleme | < 100 kB gzip | Grafik/PDF/OCR ayrı parçalarda |

## 6. Teknik özet

| Katman | Teknoloji |
|---|---|
| Arayüz | React 18 + TypeScript + Vite + Tailwind (CSS değişkeni tabanlı tema) |
| Grafik | Recharts (tembel yüklenen ayrı parça) |
| Ayrıştırma | Kural tabanlı adaptör kaydı, LLM bağımlılığı yok |
| Depolama | IndexedDB, yalnızca cihazda |
| OCR (isteğe bağlı) | FastAPI + RapidOCR, yalnızca `127.0.0.1` |
| Test | Vitest |

Ayrıntı: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## 7. Gizlilik taahhüdü

Uygulamada işlem verisini ağa gönderen hiçbir kod yolu yoktur. Yerel OCR servisi yalnızca kullanıcı açtığında ve yalnızca döngü arayüzü üzerinden çalışır, diske hiçbir şey yazmaz.
