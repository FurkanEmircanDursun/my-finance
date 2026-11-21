# My Finance 2.5.0

## Teslim edilen değişiklikler

- Açık/koyu tema, çevrimdışı Türkçe font ve sade aylık özet.
- Tutar ve kategoriyle hızlı kayıt; isteğe bağlı açıklama, tarih ve yöntem; kayıt sonrası geri alma.
- Google girişinin karşılama, üst çubuk, kenar çubuğu ve ayarlardan erişimi; Android oturum kalıcılığı ve senkron yeniden bağlanma düzeltmeleri.
- Harcama ve gelecek ekranlarında öncelikli bilgi ve isteğe bağlı ayrıntılar.
- İsteğe bağlı Firebase Analytics; serbest finansal veya kimlik parametresi kabul etmeyen olay API'si.
- FCM kayıt yaşam döngüsü, hesap izolasyonu ve tek saatlik sunucu zamanlayıcısı. Kullanıcının açık onayıyla Blaze etkinleştirildi ve FCM sunucusu yayınlandı. Cihazlar ayrıca izin vererek bulut teslimine geçebilir; yerel hatırlatmalar alternatif olarak korunur.
- Mevcut release sertifikası korunarak Android 2.5.0 (25) paketi.

## Yapılan doğrulamalar

453 frontend testi, 10 sunucu tarih/teslim testi ve 6 Firestore emulator kural testi geçti. TypeScript ve production build geçti. Tarayıcıda sentetik kayıtlarla gelir/gider hesabı, geri alma, geçersiz tutar, Akbank/Garanti kartları, e-posta giriş alanı, tema, gizlilik, klavye odağı ve yeniden yüklemede kayıt korunması kontrol edildi. 320, 393, 768 ve 1440px görünüm genişliklerinde yatay taşma görülmedi. Tasarım incelemesindeki mobil araç çubuğu ve masaüstü hesap alanı bulguları giderildi; mekanik tasarım taraması bulgu vermedi.

Kullanıcı son aşamada fiziksel cihaz testlerini kendisinin yapacağını belirtti; cihaz kurulum, Google hesap seçimi, gerçek senkronizasyon, bildirim teslimi ve Analytics sunucu alımı kabul edilmiş sayılmaz. Blaze ve canlı FCM kurulumu için kullanıcı onayı alındı. Sunucu ACTIVE, saatlik zamanlayıcı ENABLED ve iki collection-group indeksi READY olarak doğrulandı; gerçek cihaz teslimi kullanıcı kabul adımıdır. Analytics ayrı My Finance GA4 alanına bağlandı. [Firebase durumu](FIREBASE_2_5.md), [APK rehberi](APK_TESTING.md), [Android imza rehberi](ANDROID_DELIVERY_2_5.md).

## Kapsam ve korunmuş durum

Mevcut transaction şeması, integer kuruş hesabı, ekstre mutabakatı, yerel kayıtlar ve yedekler korunmuştur. Çalışma başındaki commit edilmemiş değişiklikler, IDE dosyaları ve Firebase hosting cache bu sürümün yeni değişiklikleriyle karıştırılmamalıdır. Bu teslim web Hosting yayını yapmaz; APK ve kaynak değişikliklerini kapsar.
