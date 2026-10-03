# My Finance

Kredi kartı ekstrenizi tarayıcıda okuyup analiz eden kişisel finans aracı. Dosyalar cihazınızdan çıkmaz; ayrıştırma, sınıflandırma ve tüm analiz tarayıcıda çalışır, veriler IndexedDB'de yerel olarak saklanır. İsterseniz bir Google ya da e-posta hesabıyla verileriniz cihazlarınız arasında eşitlenir; hesap açmak zorunlu değildir.

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

Üç sekme ve birkaç açılır sayfa. İlk sekme tek başına yeterli; gerisi derinleşmek isteyene.

| Sekme | İçerik |
|---|---|
| **Özet** | Seçili ekstrenin harcamasını kuruşuna kadar verir, hemen altında **ekstre hesabını** (önceki bakiye − ödemeler + dönem harcamaları = bankanın yazdığı dönem borcu) gösterir; sonra iki sayı (aylık ortalama, gelecek ay bağlı tutar), en önemli üç bulgu, toplamı tutan kategori listesi, **bonus ve puan** ve günlük akış |
| **Harcamalar** | Net harcama ve kalan (gelir girilmişse), aylık seri ve limit (iki ay varsa), kategoriler ve limitleri, düzenli ödemeler, işyerleri, "küçük ama sık" alışkanlıklar, geçen aya göre hareket edenler |
| **Gelecek** | 12 aylık bağlı tutar merdiveni, yaklaşan ödemeler (ekstre borcu ve asgari ödemesiyle), açık taksit planları, nakit akışı tahmini, tasarruf hedefi |

**Ekstre seçimi.** Sol üstteki düğme bir **dönem** ve bir **kart** seçtirir; ekranın tamamı o ekstreye göre değişir (bir kart + bir ay = bir ekstre). Ekstre dönemi, bankanın kestiği dönemdir; takvim ayı seçeneği yoktur, çünkü bankanın basılı toplamlarıyla hiçbir şey tutmaz. Ekstre hesabındaki satıra dokununca o ekstrenin **her satırı** açılır: alışveriş, taksit, faiz ve ücret, iade/indirim ve ödemeler ayrı ayrı toplanır, toplamları dönem harcamasını verir.

**Rakamlar neden tutar.** Her liste, üstündeki rakama toplanır: kategoriler (ve "Diğer N kategori", "İade ve indirimler" satırları) ana rakama, ekstreler bankanın dönem borcuna. Harcama dönem borcuna yalnızca önceki borç tamamen ödenmişse eşittir; değilse ekstre hesabı farkın ne olduğunu (ödenmeden devreden bakiye) bir cümleyle söyler.

**Bonus ve puan.** Garanti Bonus ve Akbank Chip-para: kazanılan (otomatik fatura bonusu, kampanyalar, alışverişten), harcanan ve kalan; borca etkisi yoktur, harcamaya katılmaz. Bankanın basılı toplamı esastır; satırlar toplamı açıklar.

Kategori, işyeri ya da abonelik satırına dokunmak **İşlemler** sayfasını açar: arama, bir işlemin kategorisini düzeltme (işyeri için kural olarak öğrenilir), elle kayıt ekleme.

Ayrıca **Bulgular** (tüm sıra dışı işlemler, mükerrer çekimler, açıklamalı sağlık raporu) ve **Ayarlar** — özetteki bağlantılardan ve üst çubuktan erişilir.

### Geçmiş ve veri

Özet → "Geçmiş ve veri" (ya da Ayarlar → Veri). Üç katman, her biri bir tıkla açılır:

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
npm test            # birim testleri (vitest) — 373 test
npm run verify -- <ekstre.pdf>   # gerçek bir ekstreyi okuyup bankanın toplamıyla karşılaştırır
```

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
  ui/          tasarım sistemi ilkelleri, grafik sarmalayıcıları
  views/       bölüm ekranları
  app/         kabuk, gezinme, hesap/ayar/arşiv sayfaları, tema
```

## Gizlilik

- Varsayılan olarak hiçbir işlem verisi ağa çıkmaz; ekstre dosyaları ise hesap açsanız bile **hiçbir zaman** cihazdan çıkmaz (ayrıştırma tarayıcıdadır). Yalnızca siz giriş yaparsanız, ayrıştırılmış kayıtlar (işlem, ekstre özeti, kural, profil) Google Firebase'de **yalnızca sizin hesabınızın okuyabileceği** biçimde (`firestore.rules`) saklanır. Giriş yapmadıkça hiçbir kayıt gönderilmez; bulut düğmesinin görünebilmesi için yalnızca "oturum var mı?" kontrolü yapılır (Firebase Auth SDK'sı yüklenir ve bu kontrol sırasında Firebase'in kimlik servislerine bağlanabilir). Firestore istemcisi ise ancak bir oturum eşitlemeye başlayınca indirilir.
- Yazı tipi (Inter) Google Fonts'tan yüklenir; bu istek hiçbir finansal veri taşımaz.
- Yerel OCR servisi yalnızca siz açtığınızda ve yalnızca `127.0.0.1` üzerinde çalışır; hiçbir şeyi diske yazmaz.
- Veriler tarayıcınızın IndexedDB'sinde durur. "Geçmiş ve veri" ekranından JSON/CSV alabilir, yedekten geri yükleyebilir ya da Ayarlar'dan tamamen silebilirsiniz.
- Sürüm yükseltmeleri veriyi **silmez, taşır**. Şema değiştiğinde eski kayıtlar yeni kimlik ve alan düzenine çevrilir; yalnızca okunamayacak kadar eski ya da yabancı bir kayıt reddedilir.
- Test verileri gerçek yerleşimlerden alınmış ama tutarlar, işyerleri ve numaralar uydurmadır; depoya kişisel finansal veri girmez.

> **Not:** Depoda gerçek ekstre içerikli eski örnek dosyalar bulunuyor (`data/*_sample.txt`; yerelde ayrıca `frontend/*.txt`, `data/*.json`). Bunlar geçmiş commit'lerde de yer aldığı için depoyu paylaşacaksanız önce temizlemeniz gerekir.
