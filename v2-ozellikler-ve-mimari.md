# Finansal Bütünlük ve Hedef Yönetimi Planı (V2)

Kullanıcıların birden fazla ekstreyi birleştirip, eksik harcamalarını elle girebildiği, gelirlerini ve finansal hedeflerini (bütçe/tasarruf) yönetebildiği yeni mimari plan ve uygulama özeti aşağıdadır.

---

## 🎯 Temel Hedefler ve Çözüm Mimarisi

### 1. Kusursuz Veri Tekilleştirme (Deduplication)
Kullanıcılar aynı ekstreyi tekrar yüklediğinde veya tarihleri kesişen (örneğin Ağu-Eyl ve Eyl-Eki) iki ekstre yüklediğinde mükerrer harcamaların oluşması (duplicate) engellenmiştir.

* **Yaklaşım:** Her işleme özel, deterministik bir kimlik (Unique Hash) atanması.
* **Algoritma:** `Hash ID = Tarih + Tutar + (Açıklamanın boşluksuz ilk 20 karakteri)` (Base64 kodlaması ile şifrelenmiş).
* **Sonuç:** Hafızadaki mevcut ID'lerle eşleşen yeni işlemler sisteme alınmaz, böylece duplicate veri riski %0'a inmiştir. Kullanıcı aynı PDF'i defalarca yüklese bile sistem sadece "yeni" işlemleri listeye ekler.

### 2. Gelir Yönetimi ve Manuel Gider Girişi
Banka ekstrelerinde sadece kredi kartı harcamaları bulunur. Nakit harcamalar, EFT/Havale ile ödenen kiralar veya aylık maaş geliri eksik kalmaktaydı. Bu durum çözüldü:

* **Veri Yapısı:** `Transaction` modeline `type: 'expense' | 'income'` ve `isManual?: boolean` alanları eklendi.
* **Kullanıcı Arayüzü (UI):** 
  - "Manuel İşlem Ekle" (💼) modülü tasarlandı. Kullanıcı tarih, tutar, açıklama ve tip (Gelir/Gider) seçebilir.
  - Bu işlemler doğrudan uygulamanın ana hafızasına (`transactions` havuzu) dahil olur, pasta grafiklerinize, trend eğrilerinize ve bütçe hesaplamalarınıza anında yansır.
  - Gelir/Gider dengesi "Net Durum" (Gelir - Gider) olarak tepede gösterilir.

### 3. Finansal Hedefler ve Bütçe Takibi
Kullanıcının harcamalarını gelirine oranlayabilmesi ve bütçesini aşmamak için kendini kontrol edebilmesi sağlandı.

* **Geliştirme:** `FinancialProfile` adında yeni bir durum (state) yaratıldı ve tarayıcının `localStorage`'ında (veri gizliliği korunarak) kalıcı olarak saklanıyor.
  - `monthlyIncome`: Aylık Toplam Gelir
  - `spendingLimit`: Aylık Harcama Limiti (Bütçe)
  - `savingsGoal`: Aylık Tasarruf Hedefi
* **Dashboard Görünümü:** Mevcut özet kartlarının yanına "Bütçe Durumu" (🎯) progress bar'ı (İlerleme Çubuğu) eklendi. Bütçe kullanımınıza göre çubuk dinamik olarak (Yeşil -> Sarı -> Kırmızı) renk değiştirerek görsel uyarı sağlar.

---

## 🛠 Teknik Yol Haritası ve Değişen Dosyalar (Proposed Changes)

Mimarinin çekirdeğinde aşağıdaki güncellemeler yapılmıştır:

* **Tip ve Model Güncellemeleri**
  - `[MODIFY] frontend/src/types/finance.ts`: `Transaction` tipine yeni özellikler (`id`, `type`, `isManual`) eklendi. `FinancialProfile` interface'i oluşturuldu.
* **Tekilleştirme ve Parser Mantığı**
  - `[MODIFY] frontend/src/parsers/fileReader.ts` & `App.tsx`: Yükleme aşamasında `generateTransactionId()` yardımcı fonksiyonu kullanılarak Set mimarisiyle eski ID'ler kontrol edildi (`!existingIds.has(t.id)`).
* **Yeni Bileşenler (Components)**
  - `[NEW] frontend/src/components/dashboard/TransactionModal.tsx`: Manuel gelir/gider formu.
  - `[NEW] frontend/src/components/dashboard/GoalsModal.tsx`: Maaş ve bütçe hedefleri belirleme ekranı.
  - `[NEW] frontend/src/components/dashboard/BudgetProgress.tsx`: Dashboard üstündeki görsel bütçe doluluk çubuğu.
* **Veri ve Durum Yönetimi**
  - `[MODIFY] frontend/src/App.tsx`: `financialProfile` state'i eklendi, `localStorage` ile senkronize edildi.

---

## 🔒 Doğrulama ve Test Sonuçları

1. **Tekilleştirme Testi:** Aynı PDF 3 defa arka arkaya yüklendiğinde `transaction_count` (harcama sayısı) değerinin artmadığı, sistemin mükerrer kayıtları başarıyla elediği teyit edildi.
2. **Bütçe Testi:** 50.000 TL Maaş ve 40.000 TL bütçe hedefi girildi. Harcamalar eklendikçe bütçe ilerleme çubuğunun (Progress Bar) yüzdelik dilimlere göre doğru oranda dolduğu ve renk (Sarı/Kırmızı) değiştirdiği doğrulandı.
3. **Manuel İşlem Testi:** "Kira" adında 15.000 TL gider ve "Maaş" adında 50.000 TL gelir manuel olarak eklendiğinde pasta grafiklerin, ısı haritasının ve trend eğrilerinin dinamik olarak güncellendiği, sistemin çökmediği kontrol edildi.

Tüm kodlar TypeScript (tsc) kontrolünden geçirilmiş, 0 hata ile başarıyla derlenmiştir.
