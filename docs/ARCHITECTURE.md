# Mimari

Bu belge sistemin nasıl çalıştığını ve neden böyle kurulduğunu anlatır. Kod içindeki yorumlar "neden" sorusunu yerel olarak yanıtlar; burada bütünü tarif edilir.

---

## 1. Genel yapı

```
Dosya
  │
  ├─ ingest/extract.ts ─────── metin çıkarma (txt → PDF metin katmanı → EBCDIC → yerel OCR → tarayıcı OCR)
  ├─ ingest/banks/ ─────────── format tespiti + banka adaptörü → RawRow[]
  ├─ ingest/categorize.ts ──── kural + anahtar kelime dizini → CategoryId
  ├─ ingest/pipeline.ts ────── içerik adresli kimlik, işyeri normalizasyonu → Transaction[]
  │
  ├─ store/ ───────────────── reducer + IndexedDB kalıcılık + filtreler
  │
  ├─ analytics/engine.ts ──── tek geçişli toplayıcılar → türetilmiş raporlar
  │        ├─ recurring.ts     periyot tespiti
  │        ├─ commitments.ts   taksit planları, 12 aylık merdiven
  │        ├─ anomaly.ts       aykırı değer, mükerrer çekim, alışkanlık
  │        ├─ health.ts        ağırlıklı sağlık skoru
  │        └─ insights.ts      sıralı bulgular
  │
  └─ views/ ───────────────── ekranlar (yalnızca hazır Analysis okur)
```

Tek yönlü akış: dosya → işlem → analiz → görünüm. Hiçbir görünüm kendi başına toplama veya filtreleme yapmaz.

---

## 2. Temel kararlar

### 2.1 Para kuruş tamsayısı olarak tutulur

`Money = number`, minör birimde (kuruş). Dönüşüm yalnızca ayrıştırıcı sınırında bir kez yapılır.

Sebep: binlerce satırın float toplamı kayar (`0.1 + 0.2 !== 0.3`). Yüzlerce satırlık bir ekstrede bu kayma raporlanan toplamı gerçek ekstre toplamından ayırır ve kullanıcı mutabakat yapamaz.

### 2.2 Tarih sıralanabilir dize olarak tutulur

`DayKey = "YYYY-MM-DD"`, `MonthKey = "YYYY-MM"`.

Sebep: `Date` üzerinden `toISOString()` ile gidip gelmek UTC+3'te yerel tarihleri bir gün geriye kaydırıyordu. Dize karşılaştırması aynı zamanda sıralama ve gruplama için doğrudan kullanılabilir; `Date` nesnesi ayırmaya gerek kalmaz.

### 2.3 Yön işaretle değil `kind` ile taşınır

`Transaction.amount` her zaman pozitiftir. Yön `kind` alanındadır:

| kind | Anlam | Harcamaya sayılır mı |
|---|---|---|
| `expense` | Para çıkışı | Evet |
| `refund` | İşyeri iadesi | Kendi kategorisinden düşer |
| `income` | Gelir, gelen transfer | Hayır |
| `payment` | Kart borcu ödemesi | Hayır — nakit hareketi |

Sebep: eski modelde negatif tutar hem iadeyi hem geliri hem kart ödemesini temsil ediyordu. "Ödemeniz için teşekkürler" satırı 22.000 TL'lik bir gelir gibi görünüp net durumu bozuyordu.

### 2.4 İşyeri anahtarı normalize edilir

`normalizeMerchant()` diakritikleri katlar, ödeme kuruluşu ön eklerini (`GOOGLE *`, `IYZICO`) atar, şube/şehir/terminal gürültüsünü temizler, ilk belirteci marka çıpası olarak korur.

```
"A101 9923 I353 BAHÇELİEVL"  ┐
"A101 4417 I112 KADIKOY"     ├─→  "A101"
```

Sebep: ham açıklamayla gruplamak tek bir işyerini onlarca kovaya bölüyordu; bu da hem "en çok harcanan işyerleri" listesini hem de abonelik tespitini işlevsiz bırakıyordu.

### 2.5 İşlem kimliği içerik adreslidir

`hash(date | amount | merchant | ordinal)`.

Ham satır yerine anlamsal alanlar kullanılır: aynı alışveriş bir kez PDF metin katmanından, bir kez OCR'dan okunduğunda ham metin farklı olur ama yine de yinelenen sayılmalıdır. `ordinal`, aynı gün aynı tutarlı iki gerçek işlemi ayırır.

---

## 3. İçe aktarma boru hattı

### 3.1 Metin çıkarma basamakları

Her basamak yalnızca bir öncekinin çıktısını hiçbir adaptör tanımadığında çalışır:

1. **UTF-8 okuma** — `.txt`, `.csv`. `�` görülürse `windows-1254` denenir.
2. **PDF.js metin katmanı** — dijital üretilmiş ekstreler.
3. **EBCDIC çözme** — Akbank ekstreleri; anında ve kayıpsız.
4. **Yerel OCR servisi** — gerçek tarama, isteğe bağlı, `127.0.0.1`, kullanıcı açtıysa.
5. **Tesseract.js** — tarayıcı içi, yavaş, son çare.

`pdfjs-dist` ve `tesseract.js` dinamik `import()` ile yüklenir; yalnızca `.txt` kullanan biri ikisini de indirmez.

### 3.1.1 EBCDIC

Akbank ekstreleri ana bilgisayarda üretiliyor. PDF'e gömülü alt kümeli fontların glif kodları ham EBCDIC baytları ve kullanılabilir bir `ToUnicode` tablosu yok; PDF.js bu baytları Latin-1 olarak geri veriyor:

```
"ð õ að ÷ aò ð ò ö ãÙÅÕÄèÖÓKÃÖÔ"   →   "05/07/2026 TRENDYOL.COM"
```

Önceki sürüm bunu okunamayan bir tarama sanıp OCR'a düşüyordu — yavaş, kayıplı ve ayrı bir servis gerektiren bir yol. Oysa metin eksiksiz; yalnızca kod sayfası uygulanması gerekiyor. Taban tablo CP037/CP1026 ortak yerleşimi, Türkçe harfler gerçek ekstrelerde gözlenen kodlardan eşleniyor. Belge birkaç font alt kümesi karıştırdığı için birkaç yüksek bayt alt kümeler arasında belirsiz kalıyor; bunlar işlem tablosunun kullandığı alt küme lehine çözülüyor — ayrıştırılan tek yer orası.

Tespit `looksLikeEbcdic()` ile yapılır: EBCDIC harf/rakam aralıklarındaki karakter yoğunluğu ASCII'ye göre baskınsa çözme denenir, sonuç bir adaptör tarafından tanınırsa kabul edilir.

### 3.1.2 Satır yeniden kurma

İki ayrıntı çıktının ayrıştırılabilir olup olmadığını belirliyor:

**Satır gruplama.** Parçalar taban çizgisine göre gruplanır; tolerans sayfanın kendi medyan glif yüksekliğinden türetilir. Sabit 5px eşiği küçük punto ile basılmış yoğun ekstrelerde iki satırı birleştiriyordu.

**Kelime birleştirme.** PDF üreticileri her glif dizisini ayrı bir öğe olarak yazar, dolayısıyla bir ekstre satırı onlarca parça hâlinde gelir. Her parçayı boşlukla birleştirmek kelimeleri paramparça eder (`TREN DY OL`), boşluksuz birleştirmek sütunları kaynaştırır (`355.00355.00x1`). Üstelik Akbank 9,6 punto metinde kerning için 0,24 punto genişliğinde "boşluk" öğeleri yazar. Bu yüzden bir boşluk yalnızca iki durumda eklenir: boşluk öğesinin genişliği font boyunun %12'sinden fazlaysa, ya da iki parça arasında hiç boşluk öğesi yokken yatay aralık font boyunun %25'ini aşıyorsa.

### 3.2 Adaptör kaydı

Her adaptör iki işlev sunar:

```ts
detect(text: string): number   // 0-1 güven
parse(text: string): AdapterOutput
```

`detectAdapter()` en yüksek skoru alanı seçer; eşik `MIN_CONFIDENCE = 0.35`. CSV adaptörü kasıtlı olarak 0.55 döner, böylece gerçek bir ekstre her zaman kendi adaptörüne gider.

**Akbank:** Anglo gruplama (`1,065.00`). `N/M.taksit` = toplam/sıra — açıklanan ana tutarla doğrulandı (`1.065,00 / 3 = 355,00`). Satır sonundaki sayısal sütunlardan ilki ekstreye yansıyan tutardır.

**Garanti:** Türk gruplama (`1.234,56`). Sonda `-` veya `+` alacak demektir. İki sayı varsa ilki kazanılan bonus, ikincisi tahsil edilen tutardır.

**CSV:** Sütun rolleri başlıktan çıkarılır; ayraç `;`, `\t`, `,` arasından örneklemeyle seçilir; tırnaklı alanlar RFC4180'e göre okunur.

### 3.3 Sınıflandırma

```
1. kullanıcı kuralı (işyeri → kategori)     — manuel düzeltmelerden öğrenilir
2. çok kelimeli ifade eşleşmesi              — en uzun ifade kazanır
3. tek belirteç dizin araması                — hash
4. 'other'
```

Sonuçlar normalize işyeri başına önbelleklenir: 90 farklı işyeri içeren 400 satırlık bir ekstre 400 değil 90 sınıflandırma yapar. Eski sürüm her satır için ~50 regex çalıştırıyordu.

Kategori kimliği, etiketi, rengi, harcama doğası (`need`/`mixed`/`want`/`neutral`) ve anahtar kelimeleri tek bir yerde, `domain/categories.ts` içinde tanımlıdır. Eskiden bu liste dört ayrı dosyada tekrarlanıyor ve birbirinden ayrışıyordu.

---

## 4. Analiz motoru

### 4.1 Tek geçiş

`accumulate()` işlem dizisini bir kez dolaşıp şu toplayıcıları doldurur: toplamlar, gün/ay/kategori/işyeri/banka kovaları, ay×kategori matrisi, hafta günü profili, tarih aralığı. Türetilmiş raporlar diziye değil bu haritalara bakar.

Eski analizör listeyi yedi kez tarıyordu (kategori, günlük trend, işyeri, taksit, abonelik, hafta günü, sağlık — artı sağlık içinde ikinci bir kategori geçişi) ve her kategori düzenlemesinde bunu baştan yapıyordu.

Günlük hareketli ortalama ön ek toplamlarıyla hesaplanır: pencere boyutundan bağımsız O(n).

### 4.2 Memoizasyon

`analyzeMemo()` sonucu `WeakMap<Transaction[], Map<profileKey, Analysis>>` içinde saklar. Analiz `(transactions, profile)` ikilisinde saftır; görünümler ikisine de dokunmayan sebeplerle yeniden çizildiğinde hesaplama tekrarlanmaz. Kategori düzenlemesi yeni bir dizi ürettiği için önbelleği doğru şekilde ıskalar.

### 4.3 Düzenli ödeme tespiti

Üç bağımsız sinyal:

| Sinyal | Ölçüm | Kapı |
|---|---|---|
| Periyot düzeni | Ardışık farkların medyanı bir banda düşmeli; MAD medyanın %20'sini aşmamalı | ≥ 0.50 |
| Tutar istikrarı | Tutarların MAD'ı medyanın %10'unu aşmamalı | ≥ 0.35 |
| Kanıt | En az üç tekrar; abonelik kategorisinde iki yeterli ama güven 0.62 ile sınırlı | ≥ 3 (veya 2 + abonelik) |

`güven = 0.45·düzen + 0.35·istikrar + 0.20·kanıt` (abonelik kategorisine +0.12), eşik **0.60**.

İstikrar bir kapıdır, yalnızca ağırlık değildir: düzenli aralıkla ama çok farklı tutarlarla ziyaret edilen bir benzin istasyonu, yalnızca periyot ve kanıt üzerinden sabit aylık yükümlülük sayılıyordu ve "aylık karşılığı" değeri gerçek aboneliklerin toplamını gölgede bırakıyordu.

Üç tekrar şartı da aynı sebeple var: iki ödeme bir aralık tanımlar ama bir desen tanımlamaz. Gerçek bir ekstrede yedi gün arayla yapılan iki benzer tutarlı market alışverişi "haftalık abonelik" olarak raporlanıp yıllık beş haneli bir maliyete çevriliyordu.

Aylık karşılık `medyan × (30,44 / periyot)` ile hesaplanır; haftalık, üç aylık ve yıllık ödemeler böylece karşılaştırılabilir.

### 4.4 Taksit ve yükümlülük merdiveni

Bir plan `işyeri + aylık tutar + plan uzunluğu` ile tanımlanır — bu üçlü planın kapsadığı ekstreler boyunca sabittir. Kalan taksitler, planın **en son fatura edildiği aydan sonraki** aya yerleşir. Eski projeksiyon her planı işlemin kendi ayından başlatıp ödenmiş taksiti tekrar sayıyordu; bu hem içinde bulunulan ayı çift faturalandırıyor hem de geçmişte kalan yükümlülükler gösteriyordu.

### 4.5 Aykırı değer tespiti

Ortalama/standart sapma yerine medyan/MAD. Kişisel harcama dağılımı sağa çarpıktır; tek bir kira ödemesi ortalama tabanlı eşiği şişirip diğer her şeyi gizler. Eşik, normal dağılıma denk gelecek şekilde ölçeklenmiş robust z-skorunda **3,5**. Karşılaştırma iki tabana göre yapılır: kategorinin tipik işlem büyüklüğü ve işyerinin kendi geçmişi; işyeri sinyali daha özgül olduğu için kategori sinyalini ezer.

**Mükerrer çekim:** aynı işyeri, aynı tutar, ≤3 gün ara. Düzenli ödemeler listeden çıkarılır.

**Alışkanlık ("küçük ama sık"):** medyan tutarı ≤ ₺400 ve en az 5 tekrar olan işyerleri; yıllık karşılığa ölçeklenir. Toplam bazlı bir sıralamada görünmeyen ama yıllık etkisi büyük olan harcama budur.

### 4.6 Sağlık skoru

Altı bileşen, her biri kendi ekseninde 0–100 ve kendi ağırlığıyla:

| Bileşen | Ağırlık | 100 puan | 0 puan |
|---|---|---|---|
| Tasarruf oranı | 0.30 | %25 biriktirme | −%5 |
| Sabit yük | 0.25 | gelirin %15'i | %45'i |
| İsteğe bağlı harcama payı | 0.20 | %20 | %60 |
| İstikrar (aylık CV) | 0.15 | %10 | %60 |
| Dağılım (HHI) | 0.10 | 0.15 | 0.60 |
| Sınıflandırma kapsamı | 0.08 | %95 | %60 |

Hesaplanamayan bileşenler (gelir girilmemiş, tek ay veri) düşürülür ve kalan ağırlıklar yeniden ölçeklenir. Eski skor 100'den başlayıp kategori payı sabit bir eşiği geçtiğinde keyfi puan düşüyordu; bu, yüksek market harcamalı bir ayla tamamen keyfi harcamalı bir ayı aynı puana getiriyordu.

---

## 5. Durum ve kalıcılık

Tek `useReducer` + context. Kalıcılık `IndexedDB` üzerinde ince bir anahtar-değer sarmalayıcıyla, 400 ms geciktirmeli yazma ile yapılır. Depolama engellendiğinde (gizli pencere, site verisi kapalı) bellek içi yedeğe düşülür; hiçbir yol atmaz.

`STATE_VERSION` değiştiğinde eski anlık görüntü yarım okunmak yerine atılır — ekstreler her zaman özgün dosyadan yeniden içe aktarılabilir.

Filtreler tek yerde uygulanır (`store/selectors.ts`) ve `analysis` zaten filtrelenmiş kümeden hesaplanır. Görünümler filtreleme mantığını tekrarlamaz.

**Kural öğrenme:** kullanıcı bir işlem grubuna kategori atadığında ve "kural olarak kaydet" işaretliyse, o işyerlerinin geçmiş ve gelecek tüm kayıtları güncellenir; kural içe aktarma boru hattına da geçer.

---

## 6. Arayüz

### 6.0 Gezinme

Beş sekme, insanın soruyu sorduğu sırayla: ne oldu → nereye gitti → ne tekrar ediyor → şimdiden ne borçlu → satırları göster. Önceki sürümde yedi sekme vardı; nakit akışı kategorilerden, bulgular da özetten ayrıydı. Her iki ayrım da ilk ekranı bir cevap olmaktan çıkarıp menüye çeviriyordu. Nakit akışı ve kategoriler tek bir "Harcamalar" sayfası oldu, bulgular özete taşındı ve tam listeye bağlantı verildi.

Özet ekranının tek işi var: okuyanın hiçbir şeyi kendi kafasında birleştirmek zorunda kalmadan "nasıl gidiyorum" sorusunu yanıtlamak. Bir cümleyle açılır, üç sayı verir, ardından üzerine düşünülmeye değer birkaç bulguyu sıralar. Gerisi bir tık ötede.

Tek bir renk paleti CSS değişkeni olarak `styles/index.css` içinde tanımlıdır; açık tema `:root`, koyu tema hem `prefers-color-scheme` hem `[data-theme]` altında. Tailwind renkleri bu değişkenlere bağlanır, böylece bileşenlerde `dark:` varyantı yoktur ve ürün tek bir bloktan yeniden temalandırılabilir.

Grafikler `ui/charts.tsx` içinde ince Recharts sarmalayıcılarıdır: tek eksen stili, tek ipucu bileşeni, renkler kategori tanımlarından. Uzun aralıklar SVG düğüm sayısını sınırlamak için seyreltilir.

**Paket bölme:** grafik kütüphanesi yalnızca gösterge panosu görünümleriyle yüklenir (`React.lazy`); PDF ve OCR ayrı parçalardadır. İlk açılış (her zaman içe aktarma ekranıdır) ~98 kB gzip iner.

---

## 7. Yerel OCR servisi

İsteğe bağlı FastAPI yardımcısı. Kapsamı dar: taranmış PDF'i metne çevirip geri verir. Ayrıştırma, sınıflandırma ve analiz tarayıcıda kalır.

- Model **ilk istekte** yüklenir. Eskiden modül import'u endpoint hiç çağrılmasa bile saniyelerce blokluyor, bağımlılık eksikse tüm süreç çöküyordu.
- Sonuçlar içerik hash'iyle önbelleklenir (LRU, varsayılan 8 belge).
- Sayfalar tek tek işlenip hemen serbest bırakılır; uzun ekstrelerde bellek düz kalır.
- CORS yalnızca yerel geliştirme kaynaklarına açıktır — servis finansal belge işler, rastgele bir web sayfasından erişilebilir olmamalıdır.
- Satır gruplama toleransı sayfa yüksekliğine oranlıdır, sabit piksel değil.

Yapılandırma ortam değişkenleriyle: `MYFINANCE_OCR_DPI`, `MYFINANCE_OCR_MAX_PAGES`, `MYFINANCE_MAX_UPLOAD_MB`, `MYFINANCE_OCR_CACHE`, `MYFINANCE_PORT`.

---

## 8. Testler

`npm test` — vitest, 70 test.

Kapsam: para ayrıştırma ve biçimleme, tarih aritmetiği (saat dilimi kayması dahil), işyeri normalizasyonu, EBCDIC çözme ve tespiti, PDF satır/kelime birleştirme, her iki banka adaptörü artı CSV, gerçek ekstrelerde görülen yerleşim tuhaflıkları (şablon "bosluk" hücreleri, banka bölüm başlıkları, tarih içeren düz metin paragrafları), format tespiti, düzenli ödeme tespitinin kabul ve ret durumları, taksit penceresi, motorun `kind` ayrımı ve boş veri davranışı.

Test verileri gerçek ekstre yerleşimlerinden alınmış ama tutarlar ve işyeri adları değiştirilmiştir; depoya kişisel finansal veri girmez.

**Uçtan uca doğrulama.** Ayrıştırıcı gerçek bir Akbank Axess ve gerçek bir Garanti Bonus ekstresiyle karşılaştırıldı. Her iki dosyada da okunamayan satır sayısı sıfır ve ayrıştırılan net tutar ekstrenin kendi "Dönem Borcu" rakamına kuruşu kuruşuna eşit çıktı (₺18.628,32 ve ₺34.037,58). Bu karşılaştırma kişisel dosyalara dayandığı için depoda tutulmaz; yerleşimden çıkarılan kurallar yukarıdaki testlerde sabitlenmiştir.
