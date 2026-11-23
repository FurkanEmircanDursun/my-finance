# Mizan App Store içerik hakları beyanı taslağı

**Uygulama** Mizan: Bütçe ve Ekstre 2.9.3 (29), `com.faraday.followfinance`  
**Dağıtım bölgesi** Türkiye  
**Durum** İçerik envanteri hazır. Hak dayanağı denetimi ve App Store Connect gönderimi bekliyor.

## Apple inceleme notu taslağı

> Mizan is an independently developed personal budgeting and bank statement tracking app. Bank names and logos identify the banks associated with user-entered cards or imported statements. Mizan does not act on behalf of those banks or imply affiliation. The Assets screen uses third-party reference rates to estimate the value of user-entered assets and identifies its data sources. Mizan does not execute trades, process payments, or connect to bank accounts. Supporting rights or applicable usage terms will be supplied where required.

Bu metin uygulamanın kullanımını açıklar. App Store Connect’teki **Content Rights** seçeneği ayrıca gerekli kullanım haklarının ya da izin dayanağının varlığını beyan eder. [Apple App Information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/) · [Apple App Review Guidelines §5.2](https://developer.apple.com/app-store/review/guidelines/#intellectual-property)

## Kaynaklar ve doğrulama

- **Banka işaretleri.** Uygulama `frontend/src/assets/banks/` altındaki SVG dosyalarını kart ve ekstre ekranlarında banka tanımlamak için kullanır. Kaynaklar sabitlenmiş SVG arşivi ve Garanti BBVA’nın kendi sitesidir. Açıkça belgelenmiş kullanım dayanağını banka bazında dosyalamak gerekir. [Proje logo kaynak kaydı](RELEASE_2_9.md)
- **Truncgil Finans.** Sağlayıcı anahtarsız geliştirici planı ve mobil finans kullanım örnekleri yayımlıyor. Mizan’ın ilgili veri alanlarını uygulama içinde göstermesine ilişkin varsa ek koşullar ve izin kapsamı dosyalanmalı. [Truncgil Finans geliştirici planı](https://www.truncgil.com/urun-hizmet/truncgil-finance)
- **Frankfurter.** Servis ticari kullanımı açıklıyor. Karışık oranlar ile tekil kaynak verileri için farklı koşullar belirtiyor. İlgili döviz ve metal oranlarının hangi kaynak koşullarına tabi olduğu doğrulanmalı. [Frankfurter kullanım koşulları](https://frankfurter.dev/license/)
- **ExchangeRate-API.** Açık uç nokta atıfla kişisel ve ticari kur dönüşümü ile önbelleğe izin veriyor ve yeniden dağıtımı yasaklıyor. Mizan Varlıklar ekranında sağlayıcının atıf bağlantısı bulunuyor. Dışa aktarma ve tarihsel değerleme akışlarının koşullarla uyumu hak dosyasında netleştirilmeli. [ExchangeRate-API açık uç nokta koşulları](https://www.exchangerate-api.com/docs/free)

Hak dayanağı kayıt altına alındığında App Store Connect → **App Information → Content Rights** alanında üçüncü taraf içerik bulunduğunu ve gerekli hakların mevcut olduğunu belirten seçenek kullanılabilir.
