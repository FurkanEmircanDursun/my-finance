# My Finance 2.5 Android test rehberi

## APK üretme

Windows üzerinde JDK 21, Android SDK 36 ve Node.js gerekir. Paketleri önce `frontend` klasöründe `npm ci` ile kurun.

```powershell
cd frontend
.\scripts\build-android.ps1
```

Bu komut web derlemesini Android'e kopyalar, mevcut yerel imza yapılandırmasıyla release APK üretir, imzasını doğrular ve APK ile SHA-256 dosyasını proje kökündeki `artifacts` klasörüne bırakır. İmza anahtarı ve parolaları paylaşılmaz. Yerel release anahtarı bulunmayan geliştirici `-Configuration Debug` kullanabilir.

İndirilen veya mesajla gelen APK'yı telefonda açın. Android isterse yalnızca APK'yı açtığınız uygulama için “Bilinmeyen uygulamaları yükle” iznini verin. Daha önce farklı anahtarla imzalanmış bir sürüm varsa güncelleme kurulmaz; mevcut sürümü kaldırmadan önce Ayarlar bölümünden verileri yedekleyin.

## Kısa kabul turu

1. İlk açılış rehberinde ileri, geri ve atlama seçeneklerini deneyin. Tamamladıktan sonra uygulamayı kapatıp açın; rehber kendiliğinden tekrar görünmemeli.
2. Akbank ve Garanti için kart ekleyin. Aynı bankadan ikinci kartı ekleyin; her karta ayrı isim, isteğe bağlı son dört rakam, ekstre kesim günü ve veri giriş günü verin. Düzenlemeyi ve silmeyi deneyin.
3. Bir gelir ve nakit/kira gideri ekleyin. Aylık özetin tutarları buna göre değişmeli. Kart borcu ödemesi ikinci bir harcama olarak sayılmamalı.
4. Ekstre içe aktarma, arama, ay değiştirme ve analiz ayrıntılarını deneyin. Kart eklemek geçmiş veriyi değiştirmemeli.
5. Ayarlar > Hatırlatmalar bölümünde bildirimleri açın. Android izin istediğinde onaylayın. “Test bildirimi gönder” eyleminden sonra telefonun bildirim panelini kontrol edin.
6. Kartın günlerini bugüne, hatırlatma saatini ilerideki bir saate ayarlayın. Uygulamayı arka plana alın. Bildirimin geldiğini, dokununca uygulamanın açıldığını ve PIN varsa önce kilidin sorulduğunu kontrol edin.
7. Bildirimleri kapatın veya kartı silin. Planlanan hatırlatma sayısı güncellenmeli. İzni Android ayarlarından kapatıp uygulamaya dönün; açıkmış gibi görünmemeli.
8. Ana ekrandaki hesap alanından Google ile giriş yapın. İptal edince kayıtlar korunmalı; çevrimdışı durumda anlaşılır hata ve yeniden deneme görünmeli. Başarılı girişten sonra son eşitleme durumu görünmeli. Başka hesabın yerel verisi varsa birleştirme/değiştirme tercihi açıkça sorulmalı.
9. Ayarlar > Uygulamayı geliştirmeye yardımcı ol seçeneğinde isteğe bağlı kullanım ölçümünü açıp bir kayıt ekleyin. Kapatınca yeni ürün olayları gönderilmemeli. Ölçüm seçimi cihaz üzerinde saklanır; hesap değişimi diğer cihazların tercihini değiştirmez.
10. Bu APK'da bulut bildirim alanından Firebase teslimine geçilebilir. Önce Google/e-posta hesabı eşitlemesini tamamlayıp ekstre hatırlatmalarını açın, ardından bulut bildirimlerine izin verin. Bulut teslimine geçmeden cihaz hatırlatmaları çalışır. Gerçek FCM teslimini ayrıca doğrulayın; yerel “Test bildirimi gönder” eylemi FCM kanıtı değildir.

## Bildirimlerin çalışma şekli

Ekstre ve veri giriş hatırlatmaları varsayılan olarak Android üzerinde yerel planlanır; internet, hesap veya sunucu gerekmez. 2.5 kaynak kodunda Firebase Cloud Messaging cihaz kaydı ve zamanlanmış sunucu gönderimi de bulunur. Kullanıcının açık onayıyla Firebase projesinde Blaze etkinleştirilmiş ve sunucu yayınlanmıştır. Son APK'da `VITE_FCM_SCHEDULER_ENABLED=true` kullanılır. Kullanıcı ayrıca bulut teslimini seçene kadar yerel teslim devam eder. Her açılışta, uygulamaya dönüşte ve kart/ayar değişiminde önümüzdeki 12 ayın planı yenilenir. İki gün aynı tarihe denk gelirse tek bildirim gönderilir. Ayda bulunmayan 29, 30 veya 31. günler o ayın son gününe taşınır.

Bulut gönderimi etkinleştirildiğinde kullanıcı ayrıca açıkça izin verir. Google/e-posta hesabının eşitlemesi tamamlanmış olmalıdır. Bulut saatleri Türkiye saatine göre çalışır. İki teslim yolunun aynı anda bildirim üretmemesi için cihazın yerel planı buluta geçerken iptal edilir. Çıkış yaparken cihaz kaydı silinmeye ve FCM token'ı geçersiz kılınmaya çalışılır; çevrimdışı çıkışta bu işlemler anında tamamlanamayabilir. Bildirim önizlemesine kart adı, banka adı veya tutar yazılmaz.

Bildirimler seçilen saatte yaklaşık teslim için planlanır. Android pil tasarrufu, üretici kısıtlamaları, bildirim kanalı ayarları veya uygulamayı zorla durdurma teslimi geciktirebilir ya da engelleyebilir. Kesin alarm ayrıcalığı istenmez. Günlük kullanım için uygulamayı açmak planı yeniler; uygulama 12 aydan uzun süre hiç açılmazsa yeni plan oluşmaz.

Tarayıcı sürümü otomatik cihaz bildirimi göndermez. Fiziksel cihazda izin, arka planda teslim, yeniden başlatma ve bildirime dokunma kontrolleri; birim testlerinden ve APK üretiminden ayrı doğrulanmalıdır.

Teknik kaynak: [Capacitor Local Notifications](https://capacitorjs.com/docs/apis/local-notifications).

Bulut kurulum ve kabul adımları: [Firebase 2.5 çalışma durumu](FIREBASE_2_5.md).


## Bu teslimdeki kabul sınırı

7 Kasım 2026: Kullanıcının isteğiyle fiziksel cihaz kurulum, Google hesap seçimi ve bildirim teslim testleri yapılmadı. Bu kontroller kullanıcı tarafından sonradan gerçekleştirilecek. APK imza ve dosya bütünlüğü doğrulaması cihaz kabul testinden ayrıdır.
