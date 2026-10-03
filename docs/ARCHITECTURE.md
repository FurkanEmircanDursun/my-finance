# Mimari

Bu belge sistemin nasıl çalıştığını ve neden böyle kurulduğunu anlatır. Kod içindeki yorumlar "neden" sorusunu yerel olarak yanıtlar; burada bütünü tarif edilir.

---

## 1. Genel yapı

```
Dosya
  │
  ├─ ingest/extract.ts ─────── metin çıkarma (txt → PDF metin katmanı → EBCDIC → yerel OCR → tarayıcı OCR)
  ├─ ingest/columns.ts ─────── tablo başlığından sütun okuma; bonus/chip-para sütunundaki sayıları ⟦…⟧ ile işaretler
  ├─ ingest/banks/ ─────────── format tespiti + banka adaptörü → RawRow[] + kapak özeti + sayılmayan satırlar
  ├─ ingest/categorize.ts ──── kural + anahtar kelime dizini → CategoryId
  ├─ ingest/identity.ts ────── işlem kimliği (banka, tür, taksit sırası, donmuş açıklama özeti)
  ├─ ingest/reconcile.ts ───── ayrıştırılan tutarı bankanın kendi aritmetiğiyle karşılaştırır
  ├─ ingest/pipeline.ts ────── parseStatementText: saf; işyeri normalizasyonu → Transaction[] + Reconciliation
  │
  ├─ store/ ───────────────── reducer + IndexedDB kalıcılık + filtreler
  │        ├─ migrate.ts      şema göçleri (veri silinmez, taşınır)
  │        └─ backup.ts       tam dışa aktarma, geri yükleme, CSV
  │
  ├─ sync/ ────────────────── isteğe bağlı bulut senkronu (bkz. 5.2)
  │        ├─ model.ts        saf mantık: belge kimliği, damga, mezar taşı, defter, birleştirme
  │        ├─ engine.ts       kuyruklu motor: dinle → uzlaştır → gönder → onayla
  │        ├─ transport.ts    taşıyıcı arayüzü (Firestore, bellek içi, geliştirme)
  │        └─ present.ts      durumu insan diline çeviren saf işlev
  │
  ├─ analytics/ledger.ts ──── ekstre defteri: önceki bakiye − ödemeler + harcamalar = borç; satır bölümleri
  ├─ analytics/rewards.ts ─── bonus / chip-para: kazanılan, harcanan, kalan, kaynak satırları
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

**İade, kendi kategorisinden ve işyerinden düşer.** Kategori/işyeri/banka toplamları iadeden sonraki net tutardır ve toplamları, "kategoriye bağlanamayan iade" (`totals.unallocatedRefunds`) çıkınca `netSpend`'e eşittir. Bağlanamayan iade, kendi kategorisinde alışverişi olmayan bir iadedir: alışverişten sonraki bir dönemde gelen iade ya da chip-para gibi kart kredisi. Bu tutar başlıkta (net harcama) hâlâ düşülür; kategori listesinde negatif satır olarak gösterilmez. İşyeri anahtarı `-iade` ekini atar (`IYZICO/storytel.com-iade` → `STORYTEL`), aksi hâlde her iade işyerini ikiye bölerdi.

### 2.4 İşyeri anahtarı normalize edilir

`normalizeMerchant()` diakritikleri katlar, ödeme kuruluşu ön eklerini (`GOOGLE *`, `IYZICO`) atar, şube/şehir/terminal gürültüsünü temizler, ilk belirteci marka çıpası olarak korur.

```
"A101 9923 I353 BAHÇELİEVL"  ┐
"A101 4417 I112 KADIKOY"     ├─→  "A101"
```

Sebep: ham açıklamayla gruplamak tek bir işyerini onlarca kovaya bölüyordu; bu da hem "en çok harcanan işyerleri" listesini hem de abonelik tespitini işlevsiz bırakıyordu.

### 2.5 İşlem kimliği içerik adreslidir

`hash(banka | hesap | tarih | tutar | açıklama özeti | tür | taksit sırası | ordinal)` — `ingest/identity.ts`.

Aynı ekstre yeniden yüklendiğinde ya da kesişen iki ekstre birleştirildiğinde mükerrer satır oluşmamalı; ama gerçekten farklı iki tahsilat da birbirini silmemeli.

**Taksit sırası anahtardadır.** Her ekstre, taksitli bir alışverişin satırında *ilk alışveriş tarihini* basar:

```
05/05  TRENDYOL.COM  3/1.taksit  355,00     (Temmuz ekstresi)
05/05  TRENDYOL.COM  3/2.taksit  355,00     (Ağustos ekstresi)
05/05  TRENDYOL.COM  3/3.taksit  355,00     (Eylül ekstresi)
```

Tarih, tutar ve işyeri aynı; yalnızca taksit sırası ayırır. Eski anahtar (`tarih | tutar | işyeri`) üçünü de aynı kimliğe indiriyor, 2. ve 3. ayın taksitleri içe aktarmada "mükerrer" diye **sessizce** atılıyordu — geçmiş aylık toplamlardan ve taahhüt merdivenlerinden eksik kalıyordu. `history.test.ts` bu senaryoyu üç ekstreyle sabitler.

**Türetilmiş alan anahtarda yoktur.** `merchant`, `normalizeMerchant` çıktısıdır ve her yeni ekstre ona yeni bir şehir ya da ek öğretir; anahtarda olsaydı her iyileştirme depodaki satırların kimliğini değiştirir, ekstreyi yeniden yüklemek her şeyi ikinci kez eklerdi. Anahtar, bankanın bastığı açıklamanın **donmuş** bir özetini kullanır (ilk 16 harf/rakam, büyük harf, Türkçe karakterler katlanmış). Bu kural değiştirilmemelidir; değişirse bir şema sürümü ve göç gerekir.

`ordinal`, *aynı ekstre içinde* aynı gün aynı tutarlı iki gerçek işlemi ayırır.

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

### 3.1.3 Sütun okuma

Bir satırda en fazla üç sayı bulunur: faturalanan tutar, taksitten kalan, bir sadakat rakamı (Garanti'de *Bonus*, Akbank'ta *Chip-para*). Düz metne indirgenince `150,00` ₺150'lik bir alışveriş mi 150 bonus mu, ayırt edilemez. Yalnızca bonus rakamı olan bir satır ₺150 harcama sayılıyordu; gerçek bir Garanti ekstresinde birkaç böyle satır binlerce liralık sahte harcama üretti.

PDF cevabı bilir: sayılar başlıklarının altına **sağa hizalıdır**, dolayısıyla bir sayının sağ kenarı hangi sütunda olduğunu söyler. `ingest/columns.ts`:

1. Sayfadaki satırlardan, bitişiğinde bonus/chip-para başlığı olan "Tutar…" başlığını bulur (yalnızca "Tutar" yetmez: kapaktaki "Min. Ödeme Tutarı" tabloyu taklit edebilir).
2. Başlığın altındaki sayılardan sağ kenarı bonus başlığına tutar sütunundan daha yakın olanları `⟦…⟧` içine alır.
3. Adaptör etiketli rakamı satırdan ayırır; geriye kalan faturalanan tutardır. Etiketten başka rakamı olmayan satır bir **sadakat kaydıdır**: harcamaya katılmaz, `Statement.ignored` içinde nedeniyle (`reward-earned`, `reward-spent`, `campaign`) saklanır.

Akbank'ın EBCDIC sayfalarında başlık ve rakamlar ancak kod çözüldükten sonra tanınır; `buildPageLines(items, decode)` tanıma için çözücüyü kullanır ama etiketi *özgün* metnin çevresine koyar (etiket karakterleri EBCDIC çözücünün bayt aralığı dışındadır, olduğu gibi geçer). Akbank'ın iki satıra yayılan "Dönem İçi / Chip-para" başlığı tek kelime olarak gelir; eşleştirme bunu bilir.

Sütun bilgisi olmayan metin (`.txt`) eski kurala döner: satırı iki sayı kapatıyorsa ilki bonus, ikincisi tutardır; "…BONUS" ile biten açıklama sadakat satırıdır. Belge sütun bilgisi taşıyorsa sözcük kuralı devreye girmez: sütun konumu kesin olandır.

### 3.2 Adaptör kaydı

Her adaptör iki işlev sunar:

```ts
detect(text: string): number   // 0-1 güven
parse(text: string): AdapterOutput
```

`detectAdapter()` en yüksek skoru alanı seçer; eşik `MIN_CONFIDENCE = 0.35`. CSV adaptörü kasıtlı olarak 0.55 döner, böylece gerçek bir ekstre her zaman kendi adaptörüne gider.

**Akbank:** Anglo gruplama (`1,065.00`). `N/M.taksit` = toplam/sıra — açıklanan ana tutarla doğrulandı (`1.065,00 / 3 = 355,00`). Satır sonundaki sayısal sütunlardan ilki ekstreye yansıyan tutardır.

**Garanti:** Türk gruplama (`1.234,56`). Sonda `-` veya `+` alacak demektir. İki sayı varsa ilki kazanılan bonus, ikincisi tahsil edilen tutardır.

**Kapak özeti ve mutabakat.** Her adaptör ekstrenin kapağındaki rakamları da okur (`StatementSummary`: dönem borcu, önceki bakiye, asgari ödeme, limit, aylık faiz, önceki/sonraki kesim ve son ödeme tarihi, bonus/chip-para bakiyesi). Bunlar kullanıcının *kendi harcaması* olarak hiçbir şeyi hesaplamaz; iki iş yapar: parse'ı doğrulamak ve kapaktaki bilgiyi veriyle birlikte saklamak.

`ingest/reconcile.ts`:

```
dönem borcu = önceki bakiye − ödemeler + harcamalar
⇒ bankanın kaydettiği harcama = basılı borç − önceki bakiye + ödemeler
```

Ayrıştırılan harcama (alışveriş − iade, faiz dahil) buna kuruşu kuruşuna eşit olmalıdır. `Reconciliation.delta` parse − beklenen farkıdır; `match` / `mismatch` / `unverified`. Kapakta iki rakamdan biri basılı değilse karşılaştırılacak bir şey yoktur ve sonuç hatalı değil *kontrol edilemedi*dir. Bu bir **kontrol**dür, düzeltme değil: hiçbir satıra dokunmaz. Özet ekranı fark varsa farkın kendisini söyler.

**Kalan taksit.** Akbank "Kalan Borç / Taksit" sütununda kalanı `tutar x adet` basar (`1,690.62x1` = bir taksit daha). Bu bankanın kendi sayısıdır ve `total − current` çıkarımından üstündür (erken kapatmayı ya da yeniden planlamayı görür); `Installment.remaining` olarak saklanır. Gelecek sekmesindeki kalan taksit toplamı Akbank'ın "Genel Toplam → Kalan Borç" rakamıyla örtüşür.

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

Bir plan `işyeri + aylık tutar + plan uzunluğu` ile tanımlanır — bu üçlü planın kapsadığı ekstreler boyunca sabittir. Kalan taksitler, planın **en son fatura edildiği aydan sonraki** aya yerleşir.

"Fatura edildiği ay", satırın basılı tarihi değil **ekstrenin ayıdır** (`billedMonthOf`). Taksit satırı ilk alışveriş tarihini basar: 23 Ağustos'ta alınan, Eylül ekstresinin 2/3'ü olan bir uçuş, satır tarihine bakınca Ağustos'ta faturalanmış görünür; o zaman 3. taksit "çoktan faturalandı" sanılır ve Ekim'in bağlı tutarından tüm taksit düşerdi. Gerçek bir ay verisinde Ekim'in bağlı tutarı bu yüzden %95 eksik çıkıyordu. Bankanın kendi kalan sayısı (`Installment.remaining`) varsa o kullanılır.

Taksit satırları ayrıca `billedOn` taşır (ekstrenin kesim günü) ve zaman temelli her analiz — günlük akış, takvim ayı, "…'dan …'e" aralığı — `effectiveDate(tx) = billedOn ?? date` kullanır. Aksi hâlde bir aylık ekstre Mayıs'tan başlıyormuş gibi görünürdü. Taksit satırları düzenli ödeme, sıra dışı işlem, mükerrer çekim ve alışkanlık tespitinin dışındadır: plan olarak bir kez sayılır.

### 4.5 Aykırı değer tespiti

Ortalama/standart sapma yerine medyan/MAD. Kişisel harcama dağılımı sağa çarpıktır; tek bir kira ödemesi ortalama tabanlı eşiği şişirip diğer her şeyi gizler. Eşik, normal dağılıma denk gelecek şekilde ölçeklenmiş robust z-skorunda **3,5**. Karşılaştırma iki tabana göre yapılır: kategorinin tipik işlem büyüklüğü ve işyerinin kendi geçmişi; işyeri sinyali daha özgül olduğu için kategori sinyalini ezer.

**Mükerrer çekim:** aynı işyeri, aynı tutar, ≤3 gün ara. Düzenli ödemeler listeden çıkarılır. Olasılık iki kademelidir: aynı gün (ya da ertesi gün, nadiren gidilen bir yerde) `high` — uyarı olarak çıkar; sık gidilen bir yerde birkaç gün arayla aynı tutar `low` — bilgi olarak çıkar ve bulguların başına geçemez. Gerçek bir ayda 13 kez sipariş verilen bir uygulamada iki kez aynı sepet "Acil: mükerrer çekim" oldu; bu ayrım onu düzeltir.

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

### 5.1 Şema göçleri

`STATE_VERSION` değiştiğinde eski anlık görüntü artık **atılmaz, taşınır** (`store/migrate.ts`). "Ekstreler yeniden yüklenebilir" bir yıllık geçmişi ve elle girilmiş maaşları, yüzlerce öğrenilmiş kuralı olan biri için verilebilecek bir söz değildir. Okunamayacak kadar eski ya da yabancı bir kayıt reddedilir (boş başlanır); daha yeni bir sürümden gelen yedek dosyası hatayla geri çevrilir.

v2 → v3 göçü şunları yapar:

- Her ekstre-kaynaklı satırın kimliğini yeni şemayla yeniden üretir. Yeni kimlik, aynı ekstreyi bugün içe aktarmanın üreteceğiyle **birebir aynıdır**; yoksa yeniden yükleme her satırı ikinci kez eklerdi (`migrate.test.ts` ve `history.test.ts` bunu sabitler).
- `merchant` açıklamadan yeniden türetilir; öğrenilmiş kurallar yeni anahtara taşınır (yalnızca eski anahtarın tüm satırları tek yeni anahtarda buluşuyorsa).
- Elle seçilmemiş ve "Diğer"de kalmış satırlar yeniden sınıflandırılır; kullanıcının ya da ekstre başlığının verdiği kategoriye dokunulmaz.
- Taksit satırlarına `billedOn` eklenir.
- Önceki sürümün düşürmüş olabileceği taksit satırları için bir kerelik bildirim gösterilir: ilgili ekstreleri yeniden yüklemek yalnızca eksikleri ekler. Aynı dönemin yeniden yüklenmesi ikinci bir ekstre kaydı açmaz; mevcut kaydın özetini ve mutabakatını tazeler.

Bulut senkronu şema sürümünü `users/{uid}/meta/schema` belgesine yazar; çekerken eski şemadaki veri aynı göçten geçirilir. Aksi hâlde başka cihazdaki eski kimlikli satırlar bu cihazın satırlarıyla birleşip her şeyi çoğaltırdı.

### 5.2 Bulut senkronu (isteğe bağlı)

Yerel IndexedDB her zaman gerçeğin kaynağıdır ve uygulama hesapsız tam çalışır. Giriş yapılırsa `sync/` aynı veriyi Firestore ile eşitler. Tasarım bilinçli olarak sade: *belge başına son yazan kazanır*, silme de bir belgedir.

**Veri yerleşimi.** `users/{uid}/transactions|statements|rules/{belgeId}` ve `users/{uid}/meta/{profile|prefs|schema}`. Her belge `{ _u, _d, data }` taşır: `_u` sürüm damgası (ms), `_d` mezar taşı. Kurallar işyeri başına tek belgedir (`r_<hash(işyeri)>`), hangi cihaz öğretirse öğretsin. `prefs` yalnızca tema ve dönem gruplamasıdır (gruplama artık her zaman ekstre dönemidir; alan eski veriyle uyum için duruyor); **PIN, özet ve tuz hiçbir zaman gönderilmez**, ekstre dosyaları da (yalnızca ayrıştırılmış kayıtlar).

**Neden eski tasarım atıldı.** Önceki sürüm her kaydetmede "yerelde olmayan her bulut belgesini sil" yapıyordu: yeni kurulmuş ya da eski kalmış bir cihaz ilk kaydedişinde herkesin verisini silerdi. Yenisi şunları yapar:

- **Defter (ledger).** Her cihaz belge başına son uzlaştığı içerik özetini ve damgayı tutar (`sync:ledger:{uid}`, IndexedDB). Cihazdaki duruma ve deftere bakmak, ne değiştiğini söyler: düzenleme, yeni satır, silme. İşlem günlüğü yoktur; kaybolacak ya da tekrar oynatılacak bir şey de yoktur.
- **Mezar taşı.** Silme, kendi damgası olan bir belgedir. Uzakta kalmış cihaz satırın silindiğini öğrenir, onu yeniden yüklemez; silmeden sonra aynı satırı yeniden ekleyen cihazın damgası mezar taşını geçer.
- **Sıra.** Yerel düzenleme buluttan gelen sürüm değerlendirilmeden **önce** damgalanır (`diffLocal` → `applyRemote`); çevrimdışı yapılan düzenleme, karşılaştığı her şeyden yenidir. Bekleyen (gönderilmemiş) bir düzenleme, ondan önce gelen bir uzak değişiklikle ezilmez.
- **Tam görüntü yalnızca sunucudan.** Önbellekten gelen anlık görüntü "bulutta olmayan belge silinmiştir" sonucunu **çıkarmaz**; yalnızca sunucudan gelen tam görüntü çıkarır. Aksi hâlde çevrimdışı açılış yerel veriyi silerdi.
- **Eski belgeler.** Damgasız (eski sürümün yazdığı) belgeler aynı şema göçünden geçirilip içeri alınır, sonra silinir; PIN özeti taşıyan eski `settings` belgesi hiç okunmadan silinir.
- **Hesap uyuşmazlığı.** Cihazda başka bir hesabın verisi varsa (`sync:owner`) hiçbir şey karışmaz; motor `decision` durumunda durur ve kullanıcıya sorulur: *birleştir* ya da *yalnızca bu hesabınkini kullan*. İkincisi veriyi siler, bu yüzden iki dokunuş ister ve yedeği indirme düğmesi aynı ekrandadır.
- **Çevrimdışı ve hata.** Çevrimdışı olağan bir durumdur (amber, "bağlanınca gönderilir"); yalnızca ağ varken süren hata kırmızıdır, ama mesaj her zaman "veri cihazında güvende, tekrar deneniyor"dur. Yeniden deneme 3 → 10 → 30 → 120 sn, tarayıcı `online` olduğunda hemen. Tüm iş tek kuyruktan geçer ama motor ağı **kuyrukta beklemez**: çevrimdışıyken askıda kalan bir `commit` sonraki anlık görüntüleri dondurmasın diye gönderim ve onay kuyruk dışında yürür.
- **React tarafı.** `AppStore` motoru oturum başlayınca tembel yükler ve yazım için `stateRef` kullanır: reducer o an eager da çalıştırılır; aksi hâlde motor, az önce kendi yaptığı güncellemeyi başkasının düzenlemesi sanırdı.

**Giriş (`firebase/auth.ts`).** Tek e-posta formu önce giriş dener, eşleşme yoksa hesap oluşturma ve şifre sıfırlamayı sunar (Firebase, adresin kayıtlı olup olmadığını bilerek söylemez). Google: web'de popup, engellenirse yönlendirme; Android'de yerel Google kimliği Firebase JS oturumuna verilir. Anonim oturum varken kayıt/Google **bağlanır** (uid aynı kalır); kimlik başka bir hesapta zaten varsa o hesaba girilir ve yerel veri için yukarıdaki karar sorulur. Hesap silme önce kimliği yeniden doğrular, sonra bulut verisini siler, en son hesabı kapatır; ortada hata olursa motor yeniden başlar.

**Güvenlik.** `firestore.rules`: `users/{uid}/**` yalnızca `request.auth.uid == uid` için okunur/yazılır. Anonim oturumlar da bu kapsamdadır.

**Paketleme.** Firebase Auth ve Firestore ayrı parçalardır (`vite.config.ts`). Açılışta yalnızca "oturum var mı?" için Auth gelir; Firestore, bir oturum eşitlemeye başlayınca iner. Durum tipleri `sync/status.ts` içinde küçük tutulur ki kabuk motoru çekmesin.

**Nasıl test edildi.** Motor bir `SyncTransport` arayüzünün arkasındadır; `memoryTransport` çok cihazlı bir bulutu bellekte taklit eder (`engine.test.ts`, 31 senaryo: iki cihazın aynı anda düzenlemesi, uzak silme, çevrimdışı düzenleme, önbellekten anlık görüntü, hesap uyuşmazlığı, eski belge göçü, hata ve yeniden deneme …). Mutasyon denemesiyle her kritik koşul bozuldu ve bir testin kırıldığı görüldü. **Test edilemeyenler:** gerçek Firestore (bu makinede Firestore emülatörü Java döngü bağlantısı yüzünden çalışmıyor; `firestoreTransport.ts` ince bir sarmalayıcıdır ve el ile doğrulanmalıdır) ve gerçek Google girişi. E-posta akışı yerel Auth emülatörüyle tarayıcıda denendi (kayıt, yanlış şifre, sıfırlama, çıkış/giriş, hesap uyuşmazlığı penceresi).

### 5.3 Rakamlar nasıl tutar

Ekranın tek kuralı: **bir listenin satırları, üstündeki rakama kuruşu kuruşuna toplanır; o rakam da bankanın kendi toplamına.** Bunun için üç yapı var.

- **Ekstre seçimi.** `Filters.cards` (kart adı) ve ay birlikte tek bir ekstreyi adlandırır; `statementsInScope` (`store/selectors.ts`) o ekstreleri verir. Dönem her zaman ekstre dönemidir (kesim tarihinin ayı); takvim ayı bir ekstreyi ikiye böler ve bankanın hiçbir basılı toplamıyla örtüşmez, bu yüzden seçenek kaldırıldı.
- **Defter (`analytics/ledger.ts`).** `buildLedger` bir ekstrenin satırlarını bölümlere ayırır (alışveriş, taksit, faiz ve ücret, iade/indirim, kart borcu ödemesi) ve aynı `reconcile` işleviyle ekstrenin kapağındaki rakamları, uygulamanın **bugün** tuttuğu satırlarla karşılaştırır. Satır silinirse ekstre "tutmuyor" der; içe aktarmadaki eski sonucu göstermez. Harcama dönem borcuna yalnızca önceki borç tamamen ödenmişse eşittir; değilse defter, farkın ödenmeden devreden bakiye olduğunu söyler.
- **Kategori listesi.** Bir kategoriye sığmayan iade (ör. Akbank'ın "Chip-Para ile Ödeme" kredisi, aynı kategoride alışverişi olmayan iade) eskiden listeden düşüyordu; kategoriler toplamı ana rakamdan farklı çıkıyordu (₺43.042 ↔ ₺42.920). Artık `unallocatedRefunds` ayrı bir satır olarak gösterilir ve liste `Σ kategoriler − iadeler = net harcama` kimliğini sağlar (`analytics/tieout.test.ts`).

**Bonus ve puan (`analytics/rewards.ts`).** Kazanılan = bankanın basılı "Bu dönem kazanılan" toplamı; ayrı ödül satırları (otomatik fatura bonusu, kampanyalar) çıkarılınca kalan "Alışverişlerden" olur — iadelerdeki bonus geri alımı bir alışveriş satırında görünmediği için satırları toplamak bankanın rakamını geçiyordu (₺12,60 ↔ ₺12,53). Harcanan, basılı toplam ile satırların büyüğüdür; açıklanamayan kısım "Diğer" olur. Akbank'ın chip-para ödemesi bir alacak satırı olarak gelir (borcu düşürür), bu yüzden harcanan buradan okunur.

**Gerçek ekstrelerle bağımsız denetim.** Ayrıştırıcıdan bağımsız, saf bir ikinci okuyucu (tarih + satır sonundaki tutar; banka, tür, kategori bilmez) dört gerçek ekstrenin (iki ay, iki kart) metnini okudu ve karşılaştırdı: her tutarlı satır ayrıştırıcıdaki bir satırla eşleşti ve tersi; Akbank'ın sayfa "Toplam" ve "Genel Toplam" satırları ile "Kalan Borç / Taksit" toplamları, Garanti'nin kapak defteri ve "Toplam" satırı kuruşu kuruşuna tuttu; her ekstre bankanın dönem borcuyla tuttu. Bu denetim kişisel dosyalara dayandığı için depoda tutulmaz.

### 5.4 Yedek ve dışa aktarma

`store/backup.ts`. Tek dosya, iki katman: `data` gerçeğin kaynağıdır (her işlem, her ekstre özeti/mutabakatı/sayılmayanlarıyla, kurallar, profil) ve geri yüklemenin tek okuduğu yerdir; `derived` uygulamanın hesapladığı dönem özetleri ve tüm geçmişin bulgularıdır, yalnızca insan ve başka araçlar içindir, geri okunmaz — böylece `data` ile çelişemez. Dosya kendi şema sürümünü, birimlerini (kuruş) ve `kind` anlamlarını taşır. Uygulama kilidi PIN özeti ve tuzu **hiçbir zaman** dosyaya girmez.

Geri yüklemede satır satır doğrulama yapılır (tarih biçimi, negatif/NaN tutar, bilinmeyen tür, kimliksiz satır atılır ve sayılır; bilinmeyen kategori "Diğer" olur). `merge` var olan satıra dokunmaz — düzeltilmiş bir kategori eski bir yedekle geri alınmaz; `replace` veriyi değiştirir ama cihaza ait olanı (kilit, tanıtımın görülmesi) korur. Önceki sürümlerin biçimsiz "JSON yedek" dosyaları şema 2 sayılıp göç ettirilir.

CSV: `;` ayraçlı, ondalık virgüllü, BOM'lu; **tür** (alışveriş/iade/gelir/kart ödemesi), taksit, döviz tutarı ve bonus sütunlarıyla. Eski dışa aktarma yedi sütundu ve türü atıyordu, aynı tutarlı bir iade ile alışveriş tabloda ayırt edilemiyordu.

Filtreler tek yerde uygulanır (`store/selectors.ts`) ve `analysis` zaten filtrelenmiş kümeden hesaplanır. Görünümler filtreleme mantığını tekrarlamaz.

**Kural öğrenme:** kullanıcı bir işlem grubuna kategori atadığında ve "kural olarak kaydet" işaretliyse, o işyerlerinin geçmiş ve gelecek tüm kayıtları güncellenir; kural içe aktarma boru hattına da geçer.

---

## 6. Arayüz

### 6.0 Gezinme

Üç sekme, her biri bir zaman kipi: **Özet** şimdi ne doğru, **Harcamalar** ne oldu ve nereye gitti, **Gelecek** şimdiden ne borçlu. Önceki sürümlerde yedi, sonra beş sekme vardı; nakit akışı kategorilerden, düzenli ödemeler kategorilerin açıklamasından, bulgular özetten ayrıydı. Her ayrım ilk ekranı bir cevap olmaktan çıkarıp menüye çeviriyordu. İşlem listesi, ekstre ekleme, ayarlar ve geçmiş birer açılır sayfadır (`app/sheets.tsx`): oraya bir sorudan gidilir, kendi başına bir yer değildir.

Özet ekranının tek işi var: okuyanın hiçbir şeyi kendi kafasında birleştirmek zorunda kalmadan "nasıl gidiyorum" sorusunu yanıtlamak. Bir cümleyle açılır, iki sayı verir, ardından üzerine düşünülmeye değer birkaç bulguyu sıralar. Gerisi bir tık ötede.

**Sade, ama derinleşebilir: üç basamak.** Her konu aynı merdiveni kullanır: *bir cümle* (ekranda) → *bir liste* (dokununca açılır) → *kanıt* (listenin içindeki ayrıntı). Geçmiş ve veri sayfası bunun örneğidir: dönem satırı (net harcama, tutuyor mu) → ekstre kartı (dönem, borç, mutabakat) → ayrıntı (aritmetik tablosu, kapak bilgileri, sayılmayan satırlar). Hiçbir basamak kullanıcı istemeden açılmaz; ama her sayının arkasında bir kanıt vardır.

İki küçük kural aynı ilkeden gelir. Bir grafik, anlattığı şeyi başlık söylemiyorsa gösterilir: tek ay verisinde "ay ay" sütunu yerine yalnızca limit çubuğu kalır. Bir tahmin, dayandığı girdi biliniyorsa gösterilir: gelir ya da nakit girilmemişken nakit akışı "−₺41.000" diye kırmızı bir grafik değil, ne girileceğini söyleyen tek satırdır; gelir girilmemişken "Kalan" tutarı harcamanın eksi işaretlisi olarak değil "—" olarak görünür.

Tek bir renk paleti CSS değişkeni olarak `styles/index.css` içinde tanımlıdır; açık tema `:root`, koyu tema hem `prefers-color-scheme` hem `[data-theme]` altında. Tailwind renkleri bu değişkenlere bağlanır, böylece bileşenlerde `dark:` varyantı yoktur ve ürün tek bir bloktan yeniden temalandırılabilir.

Grafikler `ui/charts.tsx` içinde ince Recharts sarmalayıcılarıdır: tek eksen stili, tek ipucu bileşeni, renkler kategori tanımlarından. Uzun aralıklar SVG düğüm sayısını sınırlamak için seyreltilir. Eksen yazı rengi stil dosyasından değil **prop olarak** verilir: Recharts her etikete `fill="transparent"` yazar ve sunum özniteliği bir CSS `@layer` kuralını yener — stil dosyasındaki kural hiç uygulanmadığı için grafikler eksen etiketsiz çiziliyordu.

**Erişilebilirlik.** Metin renkleri WCAG AA'yı (4,5:1) hem açık hem koyu temada, kendi zeminleri üzerinde sağlar (`--text-faint` açıkta 2,9–3,3:1, koyuda 3,4–4,1:1 ölçülüyordu; birincil düğmedeki beyaz yazı koyuda 2,9:1'di, artık `text-inverse`). Bir bölmenin başlığı `aria-labelledby` ile bağlıdır; açılır pencere odağı içeride tutar (Tab döngüsü), yalnızca en üstteki pencere Escape'e yanıt verir (onay penceresi, altındaki sayfayı birlikte kapatmaz) ve `onClose` her render'da yeni bir işlev olsa da odak, yazılmakta olan alandan çalınmaz (eskiden eşitleme durumu her değiştiğinde odak ilk düğmeye atlıyordu).

**Paket bölme:** grafik kütüphanesi yalnızca gösterge panosu görünümleriyle yüklenir (`React.lazy`); PDF ve OCR ayrı parçalardadır. Firebase Auth ve Firestore da ayrı, tembel parçalardır (5.2). İlk açılış (her zaman içe aktarma ekranıdır) ~98 kB gzip iner.

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

`npm test` — vitest, 373 test.

Kapsam: para ayrıştırma ve biçimleme, tarih aritmetiği (saat dilimi kayması dahil), işyeri normalizasyonu, EBCDIC çözme ve tespiti, PDF satır/kelime birleştirme, her iki banka adaptörü artı CSV, gerçek ekstrelerde görülen yerleşim tuhaflıkları (şablon "bosluk" hücreleri, banka bölüm başlıkları, tarih içeren düz metin paragrafları), format tespiti, düzenli ödeme tespitinin kabul ve ret durumları, taksit penceresi, motorun `kind` ayrımı ve boş veri davranışı.

Test verileri gerçek ekstre yerleşimlerinden alınmış ama tutarlar ve işyeri adları değiştirilmiştir; depoya kişisel finansal veri girmez.

**Uçtan uca doğrulama.** Ayrıştırıcı gerçek Akbank Axess ve gerçek Garanti Bonus ekstreleriyle, birden fazla ay için karşılaştırıldı: okunamayan satır sıfır ve ayrıştırılan net tutar ekstrenin kendi "Dönem Borcu"ndan türeyen rakama kuruşu kuruşuna eşit. Bu karşılaştırma kişisel dosyalara dayandığı için depoda tutulmaz; her ekstre içe aktarılırken **kendi kendini doğruladığı** için (bkz. 3.2) kullanıcı bunu her dosyada görür. Yerleşimden çıkarılan kurallar testlerde, uydurma tutar ve işyerleriyle sabitlenmiştir (`ingest/fixtures.ts`).

Aynı kodu dosya sistemi üzerinden çalıştıran komut: `npm run verify -- ekstre.pdf [--rows] [--json]`. Tarayıcıdaki satır kurucuyu, EBCDIC çözücüyü, adaptörleri ve mutabakatı birebir kullanır; fark varsa çıkış kodu 1'dir.

**Bu turda gerçek ekstrelerin ortaya çıkardığı hatalar** (her biri bir testle sabitlendi):

| Hata | Etkisi | Sabitleyen test |
|---|---|---|
| Bonus sütunundaki sayı harcama sayılıyordu | Garanti ekstresinde binlerce liralık sahte harcama | `statements.test.ts` (sütun), `columns.test.ts` |
| Taksit satırları 2. ayda mükerrer sayılıp atılıyordu | Geçmiş eksik, taahhüt merdiveni eksik | `history.test.ts`, `statements.test.ts` (kimlik) |
| Taksit, ekstre değil alışveriş tarihine göre yerleşiyordu | Gelecek ayın bağlı tutarı %95 eksik | `billing.test.ts` |
| Taksit satırlarının alışveriş tarihi dönem aralığını ve günlük grafiği Mayıs/Temmuz'a uzatıyordu | Yanlış tarih aralığı, sahte günlük akış | `billing.test.ts` |
| Fatura numarası işyeri anahtarına giriyordu | Aylık faturalar hiçbir zaman düzenli ödeme olarak tanınmıyordu | `billing.test.ts` |
| Sık gidilen yerde aynı tutar "Acil mükerrer çekim" oluyordu | Özet'te yanlış alarm | `billing.test.ts` |
| Schema değişince veri siliniyordu | "Tüm geçmişi koru" ile çelişki | `migrate.test.ts` |
| İade kategori/işyerinden düşmüyordu; `-iade` ekiyle işyeri ikiye bölünüyordu | Kategori toplamı başlıkla uyuşmuyordu | `billing.test.ts`, `analytics.test.ts` |
| Bilinmeyen bölüm başlığı önceki bölümün kategorisini taşıyordu | Yanlış ipucu | `statements.test.ts` |
| Garanti kapağındaki defter satırı ("ÖNCEKİ BAKİYE … = …") okunmuyordu | Bir kartın ilk ekstresi mutabakatsız ("doğrulanamadı") kalıyordu | `statements.test.ts` (ilk ekstre) |
| Kart faiz/ücret satırları "sıra dışı işlem" sayılıyordu | Her ay faiz için yanlış alarm | `billing.test.ts` |
| Bankanın kestiği işyeri adı ("… MİNİ MA …") kategorisini bulamıyordu | Market harcaması "Diğer"de kalıyordu | `billing.test.ts` |
| Eski senkron her kaydetmede yerelde olmayan bulut belgelerini siliyordu | Eski ya da yeni kurulmuş cihaz herkesin verisini silerdi | `engine.test.ts` |
| Grafik eksen etiketleri şeffaftı (Recharts `fill="transparent"`, CSS `@layer` yenilgisi) | Hiçbir grafikte tutar ya da tarih okunmuyordu | tarayıcıda doğrulandı; `charts.tsx` notu |
| Açılır pencere, her render'da odağı ilk düğmeye taşıyordu | Yazarken eşitleme durumu değişince alan odağını kaybediyordu | tarayıcıda doğrulandı |
