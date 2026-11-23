# Mizan

**Ayın dengesi, senin elinde.** Mizan; kart, kira, nakit giderleri ve kaydedilen geliri takvim ayında bir araya getiren kişisel bütçe uygulamasıdır. Önceki adı My Finance olan aynı uygulamanın yeni kimliğidir. Mevcut kayıtlar, kart kimlikleri ve yedek uyumluluğu korunur.

Mizan 2.9’da çalışma alanı Google veya e-posta hesabıyla açılır. Ekstre dosyaları cihazda ayrıştırılır. Ayrıştırılan işlemler, kartlar ve hesap tercihleri Cloud Firestore’da saklanır. Geçiş, dağıtım ve cihaz kabul adımları [2.9 sürüm rehberinde](docs/RELEASE_2_9.md).

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

## Mizan deneyimi — 14 Kasım 2026

Mürekkep laciverti gezinme, iris moru eylemler ve ferah okuma yüzeyleri Mizan’ın yeni görsel sistemini oluşturur. Özet ekranı kaydedilen gelir, net gider ve gelirden kalanı; aylık harcama alanı, görünür günlük/birikimli grafik, kategori dağılımı, son hareketler ve kart tarihleriyle birleştirir. Kalan tutar banka bakiyesi olarak sunulmaz.

İlk açılışta örnek bir ayı deneyebilirsiniz: geliri değiştirin, kirayı dahil edin veya çıkarın, harcama limitini hareket ettirin. Örnekler kayıtlara eklenmez. Ardından kart, gelir ve isteğe bağlı hatırlatmaları tamamlayabilir ya da bütün adımları atlayabilirsiniz. Gerçek kayıt akışına girildiğinde örnek görünüm kapanır.

Hızlı kayıt tutar ve kategoriyle başlar; açıklama isteğe bağlıdır. Kayıt sonrası geri alma, tutar gizliliği, açık/koyu tema ve azaltılmış hareket desteği devam eder. Masaüstünde kenar çubuğu, telefonda güvenli alanları gözeten alt gezinme kullanılır. Yeni M simgesi web, Android launcher, bildirim ve açılış kaynaklarında aynı kimliği taşır.

Bu çalışma kaynak kodu ve yerel önizlemeyi yeniler. Bu görevde Firebase yayını veya yeni APK üretilmedi; mevcut bulut kurulumu ve cihaz teslimi yeni bir dağıtım kanıtı olarak sunulmaz. Ayrıntılar: [Mizan yenileme kaydı](docs/MIZAN_REDESIGN.md), [tasarım sistemi](DESIGN.md).

### Tarihsel bağlam: 7 Kasım 2026, Android 2.5

O tarihteki tasarım beyaz yüzeyler, yeşil eylemler ve gerektiğinde açılan ayrıntılarla aylık özeti sadeleştiriyordu. Mizan bu görsel kimliği değiştirir; aşağıdaki kart ve bildirim yetenekleri önceki uygulama çalışmasının bağlamıdır. İlk kurulum dört adımda kart, gelir ve hatırlatmaları açıklar. Google girişi ilk kurulumda ve ana hesap alanında görünürdür. Hızlı kayıt tutar ve kategoriyle tamamlanır; açıklama isteğe bağlıdır ve kayıt sonrası geri alma bulunur. Aylık özette kaydedilen gelir, gider ve gelirden kalan birlikte görünür. Akbank ve Garanti için birden fazla kart, her kart için ekstre kesim günü ve aylık veri giriş günü tanımlanabilir. Ekstre aktarımında kart seçimi geçmişi birbirinden ayırır; kartı kaldırmak kayıtları silmez.

Android bildirimlerinin cihaz üzerinde izinle zamanlanması önceki sürümde uygulanmıştı. 7 Kasım kaydında Firebase FCM sunucu/istemci kurulumu, kullanıcı onayıyla Blaze planı ve Türkiye saatine göre saatlik zamanlayıcının etkinleştirilmesi raporlandı. Bu altyapı durumu 14 Kasım tasarım çalışmasında yeniden sorgulanmadı. Bulut bildirimleri için hesap eşitlemesini tamamlayıp ayrıca izin verin. İsteğe bağlı Analytics yalnız cihaz izni sonrasında ürün olaylarını ölçer. [Firebase kurulum durumu](docs/FIREBASE_2_5.md). Ayarlar bölümünde saat seçimi ve test bildirimi bulunur. [APK üretme, kurulum ve cihaz test rehberi](docs/APK_TESTING.md). Önceki sürümün tarihli doğrulaması [2.3 sürüm notlarında](docs/RELEASE_2_3.md) saklanır.

## Ne yapar

Üç analiz sekmesi ve ortak kayıt akışı. Kredi kartı ekstresi yüklemeden kira, nakit gider veya gelir kaydıyla başlanabilir. Masaüstünde kenar çubuğu, telefonda alt gezinme kullanılır.

| Sekme | İçerik |
|---|---|
| **Özet** | Takvim ayında net harcama; kart, kira/aidat ve diğer kart dışı gider dökümü; kaydedilen gelir ve kalan; günlük ritim, kategoriler, bulgular, son hareketler ve tam ekstre kontrolü |
| **Harcamalar** | Net harcama ve kalan (gelir girilmişse), aylık seri ve limit (iki ay varsa), kategoriler ve limitleri, düzenli ödemeler, işyerleri, "küçük ama sık" alışkanlıklar, geçen aya göre hareket edenler |
| **Gelecek** | 12 aylık bağlı tutar merdiveni, yaklaşan ödemeler (ekstre borcu ve asgari ödemesiyle), açık taksit planları, nakit akışı tahmini, tasarruf hedefi |

**Dönem ve hesap seçimi.** Üstteki kontrol takvim ayını ve varsa kartı seçtirir. Tüm hesaplar seçiliyken kart, kira ve nakit birlikte analiz edilir. Ekstre hesabı belgenin tamamına aittir; ekstre kesim dönemi takvim ayıyla aynı olmadığından iki toplamın eşit olması beklenmez. Özet veya ekstre arşivinden belgenin mutabakatı ve her satırı açılır.

**Kayıt ekleme.** Ana eylemden gelir/gider, gerçek tarih, kategori ve Nakit / Banka-EFT / Diğer yöntemi seçilir. Kira ve fatura kısayolları bulunur. Türkçe tutarlar tam okunur: `15.000` ve `1.250,50`. Sabit gider sayfasında geçmiş aylara toplu kayıt girilebilir. Kart borcu ödemesi yeni harcama sayılmaz; iadeler net harcamayı azaltır. Kayıtlı gelir bulunmadan kalan tutar uydurulmaz.

**Kontrol.** Ekstre toplamları güncel işlem kayıtlarıyla yeniden karşılaştırılır. Eksik/silinmiş satır fark yaratırsa ana görünümde uyarılır. Banka toplamının eşleşmesi, bütün kategorilerin doğru olduğu anlamına gelmez; belirsiz işyerleri kullanıcı kontrolüne bırakılır.

**Bonus ve puan.** Garanti Bonus ve Akbank Chip-para: kazanılan (otomatik fatura bonusu, kampanyalar, alışverişten), harcanan ve kalan; borca etkisi yoktur, harcamaya katılmaz. Bankanın basılı toplamı esastır; satırlar toplamı açıklar.

Kategori, işyeri ya da abonelik satırına dokunmak **İşlemler** sayfasını açar: arama, bir işlemin kategorisini düzeltme (işyeri için kural olarak öğrenilir), elle kayıt ekleme.

Ayrıca **Bulgular** (tüm sıra dışı işlemler, mükerrer çekimler, açıklamalı sağlık raporu) ve **Ayarlar** — özetteki bağlantılardan ve üst çubuktan erişilir.

### Geçmiş ve veri

Kenar çubuğu → "Ekstreler ve yedekler" (ya da Ayarlar → Veri). Üç katman, her biri bir tıkla açılır:

| Katman | Gösterdiği |
|---|---|
| **Dönemler** | Her ay: net harcama, işlem ve ekstre sayısı, ekstrelerin bankayla tutup tutmadığı |
| **Ekstre** | Dönem, son ödeme, ekstredeki borç, **mutabakat** (parse ettiğimiz tutar bankanın kendi aritmetiğiyle kuruşu kuruşuna tutuyor mu), kapak bilgileri (limit, asgari ödeme, faiz, bonus bakiyesi) |
| **Sayılmayan satırlar** | Bonus/kampanya satırları para hareketi olmadığı için harcamaya katılmaz ama silinmez; tek tek listelenir |

**Dışa aktarma.** "Tümünü JSON indir" her şeyi tek dosyada verir: her işlem (ham satırıyla, döviz tutarı, taksit bilgisi, kazanılan bonus), her ekstre (özet, mutabakat, sayılmayan satırlar), öğrenilen kurallar, profil ve — türetilmiş olarak — her dönemin özeti ile tüm geçmişin bulguları. Tutarlar kuruş cinsindendir. Her dönemin kendi JSON/CSV düğmesi de var. Uygulama kilidi PIN'i dosyaya **asla** girmez.

**Geri yükleme.** Aynı ekranda. *Birleştir* eksik olanı ekler ve var olana dokunmaz (düzelttiğin kategoriler geri alınmaz); *Değiştir* bu cihazdaki veriyi yedekle değiştirir. Eski sürümlerin "JSON yedek" dosyaları da okunur ve yeni şemaya taşınır.

> Android kabuğunda dosya kaydetme eklentisi henüz yok (`@capacitor/filesystem` yerel yeniden derleme ister). Orada paylaşım menüsü denenir, olmazsa JSON panoya kopyalanabilir.

### Hesap ve senkron (isteğe bağlı)

Üst çubuktaki bulut simgesi (ya da Ayarlar → Hesap ve senkron). Kapalıyken her şey yalnızca bu cihazda kalır.

- **Giriş.** *Google ile devam et* ya da tek bir e-posta + şifre formu. Form önce giriş yapmayı dener; eşleşme yoksa *Yeni hesap oluştur* ve *Şifremi sıfırla* seçeneklerini sunar. Firebase bir adresin kayıtlı olup olmadığını söylemediği için "kayıt ol / giriş yap" ayrımı kullanıcıya sorulmaz. Giriş sırasında sayfa kapanmaz: form olduğu yerde durum satırına dönüşür.
- **Eşitleme.** İşlemler, ekstreler, kategori kuralları, profil (gelir, limit, hedef, bütçeler) ve tema. Her değişiklik kısa bir beklemeden sonra kendiliğinden gider; internet yokken cihazda bekler, bağlanınca gider. Üst çubuktaki simge durumu söyler (güncel / eşitleniyor / çevrimdışı / gönderilemedi).
- **Hiçbir şey sessizce silinmez.** Bir cihazda yapılan silme diğerlerine "silindi" işaretiyle ulaşır; çakışmada son düzenleme kazanır. Bir cihazda başka bir hesabın verisi varsa uygulama sorar: *birleştir* ya da *yalnızca bu hesabınkini kullan* (ikincisi iki dokunuş ister, yedeği indirme bağlantısı aynı ekrandadır).
- **PIN asla buluta gitmez.** Uygulama kilidinin özeti ve tuzu yalnızca cihazdadır.
- **Çıkış** verileri cihazda bırakır. *Bulut verilerimi sil* buluttaki kopyayı siler ve çıkış yapar; *Hesabımı sil* hesabı da kapatır (önce kimlik yeniden doğrulanır).

Kurulum: `frontend/.env.example` dosyasını `.env.local` olarak kopyalayıp Firebase web uygulaması değerlerini doldurun; Firebase konsolunda Authentication → Google ve E-posta/Şifre'yi açın, Firestore'u oluşturun ve `firestore.rules` dosyasını yayınlayın (`firebase deploy --only firestore:rules`). Değerler boşsa bulut düğmesi hiç görünmez ve uygulama bütünüyle yereldir.

Geliştirirken gerçek projeye dokunmadan denemek için: `VITE_FIREBASE_AUTH_EMULATOR=http://127.0.0.1:9099` (Auth emülatörü) ve `VITE_SYNC_TRANSPORT=memory` (sayfa içinde sahte bulut) değişkenlerini `frontend/.env.development.local` dosyasına yazın.

## Desteklenen kaynaklar

- **Akbank / Axess** — `.txt` ve `.pdf`
- **Garanti BBVA / Bonus** — `.txt` ve `.pdf`
- **Genel CSV** — başlık satırında tarih ve tutar sütunu olan her dışa aktarım

Akbank PDF'leri ana bilgisayarda üretiliyor ve metin katmanı EBCDIC kodlu geliyor; uygulama bunu doğrudan çözer, OCR'a gerek kalmaz.

**Her ekstre kendini doğrular.** Kapak, `dönem borcu = önceki bakiye − ödemeler + harcamalar` diye bir defter tutar. Uygulama içe aktarırken okuduğu satırları bu denkleme koyar: tutuyorsa "Ekstreyle kuruşu kuruşuna tutuyor", tutmuyorsa farkın kendisini ("₺X fazla okundu") Özet ekranında söyler. Bu kontrol, tutar sütunu ile bonus/chip-para sütununun karışması gibi sessiz hataları yakalar; satırlara dokunmaz, yalnızca haber verir.

Sütunlar **konumdan** okunur: sayılar başlığının altına sağa hizalıdır, bu yüzden bir sayının sağ kenarı hangi sütunda olduğunu söyler. Açıklamadaki sözcüklere bakan kural yalnızca sütun bilgisi olmayan metin dışa aktarımları (`.txt`) için yedektir.

Kendi ekstrelerini hiçbir yere göndermeden doğrulamak için:

```bash
cd frontend
npm run verify -- "C:\Users\ben\Downloads\ekstre.pdf" [başka.pdf …] [--rows] [--json]
```

Aynı kodu tarayıcıdaki gibi çalıştırır; `MATCH` / `MISMATCH` / `UNVERIFIED` der, fark varsa çıkış kodu 1'dir.

Yeni bir banka eklemek: `src/ingest/banks/` altına bir adaptör dosyası yazıp `src/ingest/banks/index.ts` içindeki `ADAPTERS` dizisine ekleyin. Boru hattının geri kalanında değişiklik gerekmez.

## Komutlar

```bash
npm run dev         # geliştirme sunucusu
npm run build       # tip kontrolü + üretim derlemesi
npm run typecheck   # yalnızca tip kontrolü
npm test            # birim testleri (vitest)
npm run verify -- <ekstre.pdf>   # gerçek bir ekstreyi okuyup bankanın toplamıyla karşılaştırır
```

Güncel yenilemenin kapsamı ve doğrulama sınırları: [Mizan yenileme kaydı](docs/MIZAN_REDESIGN.md). Önceki sürüm hazırlığı tarihsel bağlamdır: [Sürüm hazırlığı](docs/RELEASE_READINESS.md). Görsel sistem: [DESIGN.md](DESIGN.md).

## Mimari

Ayrıntı için [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

```
src/
  core/        para (kuruş tamsayı), tarih, istatistik, metin, hash
  domain/      tipler ve kategori tek kaynağı
  ingest/      metin çıkarma, banka adaptörleri, sınıflandırma, boru hattı
  analytics/   tek geçişli analiz motoru ve modülleri
  store/       reducer, IndexedDB kalıcılık, seçiciler, yedek/göç
  sync/        bulut senkron motoru (saf model + motor + Firestore taşıyıcısı)
  firebase/    Auth (Google, e-posta) ve yapılandırma; hepsi tembel yüklenir
  ui/          Brand, BudgetRibbon, MoneyValue, ilkeller ve grafikler
  views/       bölüm ekranları ve useOverviewModel sunum modeli
  app/         yaşam döngüsü, WorkspaceChrome, kurulum, hesap/ayar/arşiv ve tema
```

## Gizlilik

- Varsayılan olarak hiçbir işlem verisi ağa çıkmaz; ekstre dosyaları ise hesap açsanız bile **hiçbir zaman** cihazdan çıkmaz (ayrıştırma tarayıcıdadır). Yalnızca siz giriş yaparsanız, ayrıştırılmış kayıtlar (işlem, ekstre özeti, kural, profil) Google Firebase'de **yalnızca sizin hesabınızın okuyabileceği** biçimde (`firestore.rules`) saklanır. Giriş yapmadıkça hiçbir kayıt gönderilmez; bulut düğmesinin görünebilmesi için yalnızca "oturum var mı?" kontrolü yapılır (Firebase Auth SDK'sı yüklenir ve bu kontrol sırasında Firebase'in kimlik servislerine bağlanabilir). Firestore istemcisi ise ancak bir oturum eşitlemeye başlayınca indirilir.
- DM Sans Variable yazı tipi ve Türkçe karakterleri uygulamaya yerel olarak paketlenir; Google Fonts isteği yapılmaz.
- Yerel OCR servisi yalnızca siz açtığınızda ve yalnızca `127.0.0.1` üzerinde çalışır; hiçbir şeyi diske yazmaz.
- Veriler tarayıcınızın IndexedDB'sinde durur. "Ekstreler ve yedekler" ekranından JSON/CSV alabilir, yedekten geri yükleyebilir ya da Ayarlar'dan tamamen silebilirsiniz.
- Sürüm yükseltmeleri veriyi **silmez, taşır**. Şema değiştiğinde eski kayıtlar yeni kimlik ve alan düzenine çevrilir; yalnızca okunamayacak kadar eski ya da yabancı bir kayıt reddedilir.
- Test verileri gerçek yerleşimlerden alınmış ama tutarlar, işyerleri ve numaralar uydurmadır; depoya kişisel finansal veri girmez.

> **Not:** Depoda gerçek ekstre içerikli eski örnek dosyalar bulunuyor (`data/*_sample.txt`; yerelde ayrıca `frontend/*.txt`, `data/*.json`). Bunlar geçmiş commit'lerde de yer aldığı için depoyu paylaşacaksanız önce temizlemeniz gerekir.
