"""Rebuild Mizan's concise Turkish product/architecture report without external assets."""
from argparse import ArgumentParser
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate, Flowable, Frame, PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output' / 'pdf' / 'mizan-mimari-ve-urun-raporu.pdf'
INK = colors.HexColor('#202335')
IRIS = colors.HexColor('#7161d8')
MUTED = colors.HexColor('#62657b')
PALE = colors.HexColor('#f5f5fa')
LINE = colors.HexColor('#e4e4ef')
GREEN = colors.HexColor('#1f7a4d')
WIDTH, HEIGHT = A4
MARGIN = 43
CONTENT = WIDTH - 2 * MARGIN


def fonts():
    directory = Path('C:/Windows/Fonts')
    pdfmetrics.registerFont(TTFont('Mizan', str(directory / 'arial.ttf')))
    pdfmetrics.registerFont(TTFont('Mizan-Bold', str(directory / 'arialbd.ttf')))
    pdfmetrics.registerFontFamily('Mizan', normal='Mizan', bold='Mizan-Bold', italic='Mizan', boldItalic='Mizan-Bold')


class Architecture(Flowable):
    def __init__(self):
        super().__init__()
        self.width, self.height = CONTENT, 104

    def draw(self):
        c = self.canv
        columns = [0, 172, 344]
        titles = ['Ekran ve akış', 'Alan ve durum', 'Saklama / servis']
        labels = [['Sayfa rotaları', 'Tarih ve kart kapsamı', 'Yükleme / hata / geri al'], ['Kuruş ve miktar modeli', 'Kart kimliği / dönem', 'Sürüm politikası'], ['IndexedDB + yedek', 'İsteğe bağlı Firebase', 'Fiyat + tarihli önbellek']]
        for x, title, rows in zip(columns, titles, labels):
            c.setFillColor(PALE)
            c.roundRect(x, 4, 164, 96, 9, fill=1, stroke=0)
            c.setFillColor(IRIS)
            c.setFont('Mizan-Bold', 10)
            c.drawString(x + 12, 78, title)
            c.setFillColor(MUTED)
            c.setFont('Mizan', 8.4)
            for index, row in enumerate(rows):
                c.drawString(x + 12, 57 - index * 17, row)
        c.setStrokeColor(IRIS)
        c.setLineWidth(1)
        for x in [164, 336]:
            c.line(x, 53, x + 8, 53)


def build(frontend_tests, final_validation, app_version, remote_config_status, remote_config_version):
    fonts()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    styles = {
        'title': ParagraphStyle('title', fontName='Mizan-Bold', fontSize=28, leading=33, textColor=INK, spaceAfter=12),
        'deck': ParagraphStyle('deck', fontName='Mizan', fontSize=12, leading=18, textColor=MUTED, spaceAfter=20),
        'h2': ParagraphStyle('h2', fontName='Mizan-Bold', fontSize=14, leading=19, textColor=INK, spaceBefore=18, spaceAfter=9),
        'body': ParagraphStyle('body', fontName='Mizan', fontSize=10, leading=15.2, textColor=INK, spaceAfter=9),
        'small': ParagraphStyle('small', fontName='Mizan', fontSize=8.5, leading=12.8, textColor=MUTED, spaceAfter=7),
        'cell': ParagraphStyle('cell', fontName='Mizan', fontSize=9, leading=13, textColor=INK),
        'head': ParagraphStyle('head', fontName='Mizan-Bold', fontSize=8.8, leading=12, textColor=IRIS),
    }

    def p(text, style='body'):
        return Paragraph(text, styles[style])

    def heading(title, deck):
        return [p(title, 'title'), p(deck, 'deck')]

    def table(headers, rows, widths):
        data = [[p(escape(cell), 'head') for cell in headers]]
        data += [[p(cell, 'cell') for cell in row] for row in rows]
        result = Table(data, colWidths=widths, hAlign='LEFT', repeatRows=1)
        result.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('BACKGROUND', (0, 0), (-1, 0), PALE),
            ('LEFTPADDING', (0, 0), (-1, -1), 11),
            ('RIGHTPADDING', (0, 0), (-1, -1), 11),
            ('TOPPADDING', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
            ('LINEBELOW', (0, 0), (-1, -1), .45, LINE),
        ]))
        return result

    def section(title, text):
        return KeepTogether([p(title, 'h2'), p(text)])

    def link(label, url):
        return f'<link href="{url}" color="#5b49b5">{escape(label)}</link>'

    story = []
    story += heading('Daha net bir finans deneyimi.', f'Mizan {escape(app_version)} - Mimari, ürün ve Firebase rehberi<br/>14 Kasım 2026 | Web + Capacitor Android | Paket kodu 26')
    story.append(p('Bu sürümün odağı, kullanıcının seçtiği dönem ile yaptığı işlemi aynı bağlamda tutmak. Ayarlar ve kartlar gerçek sayfalara taşındı; kayıt silme, eksik ekstre ve varlık takibi doğrudan eylemlerle tamamlandı.'))
    story.append(table(['Alan', 'Sonuç'], [
        ('Dönem ve kayıt', 'Geçmiş ayda giriş doğru tarihten başlar. Girilen tarih esas alınır. Görünür silme eylemi ve açık pencerenin içinde erişilebilir Geri Al bulunur.'),
        ('Kart deneyimi', 'Yıl-ay seçimi, kart listesi ve karta özel ayrı detay rotası. Kesim günü geçmiş eksik ekstre için Hemen Ekle / Kartı Sil eylemleri.'),
        ('Canlı varlıklar', 'Gram / çeyrek altın, gram gümüş, USD ve EUR miktarı. Fiyat kaynağı, güncellik ve eksik değer görünür; varlıklar gelir-giderden ayrıdır.'),
        ('Uzaktan yönetim', 'Remote Config güncelleme kapısı, ayrı performans izni ve mevcut hesap / eşitleme / bildirim servisleriyle bütünleşen katmanlar.'),
    ], [105, CONTENT - 105]))
    story.append(p('Modüllerin sorumluluğu', 'h2'))
    story.append(Architecture())
    story.append(p(f'<b>Doğrulama anı:</b> {frontend_tests} frontend testi ve 11 bildirim sunucu testi yerel olarak geçti. {escape(final_validation)}', 'small'))
    story.append(p('Yerel test, canlı Firebase ürününün sağlandığı veya gerçek telefona bildirim ulaştığı anlamına gelmez. Bu ayrım raporun tamamında korunur.', 'small'))
    story.append(PageBreak())

    story += heading('Akışlar birbiriyle tutarlı.', 'Kullanıcının seçimi görünür kalır; veri kimliği ve finansal hesap aynı kuralları izler.')
    story.append(section('Seçili ay, kaydın başlangıç noktası', 'Yeni gelir / gider formu seçili ayın tarihinden başlar; gün kısa aya sığmıyorsa o ayın son gününe sınırlandırılır. Kullanıcı başka bir tarih girerse o tarih kaydedilir. Form tarihi görünürdür; kayıt sonrası doğru dönem açılır. Yıl ve ardından ay seçimi, henüz kaydı olmayan eski bir aya da giriş sağlar.'))
    story.append(section('Kart detayında yalnız o kartın hareketleri', 'Kart listesi ve detay ayrı rotalardır. Seçili ayın kart harcamaları, iadeleri, kategorileri ve net toplamı birlikte görünür. Fiziksel kimlik banka adından ayrıdır; aynı bankadaki iki kartın aynı alışverişi korunur. Eski taksitlerde etkin faturalama tarihi kullanılır.'))
    story.append(section('Kart kaydını ertele; kimliği kaybetme', 'İşlemler ayrıştırılmadan önce fiziksel kart kimliği ayrılır. Kartı kaydetmeyi ertelediğinde sonraki aktarımda o ekstre kimliğini veya Yeni / farklı kartı seçebilirsin. Birden fazla aday varsa sistem tahmin etmez. Arşivde aynı ad / son dört hane bulunması yeni kimliği değiştirmez; geri yükleme açıkça aynı kimlikle yapılır. Kart ve kesim günü kaydı ile bildirim izni ayrı, isteğe bağlı adımlardır.'))
    story.append(section('Eksik belgeyi doğru tamamla', 'Kesim günü geçmiş ayda belge yoksa Hemen Ekle ilgili kartı seçer. Hareketsiz ekstre; açık banka ifadesi, kesim tarihi, okunamayan satır olmaması ve kapak mutabakatıyla kabul edilir. Okunamayan boş belge eksik durumunu kapatmaz. Kartı kaldırmak geçmişi silmez; Geri Al aynı kimliği geri getirir. Yeni hatırlatma saati 20:00; eski saat tercihi korunur. Yerel plan ve FCM aynı cihazda birbirinin yedeğidir.'))
    story.append(table(['Korunan kural', 'Uygulamadaki karşılığı'], [
        ('Finansal doğruluk', 'Tutarlar tamsayı kuruş. İade harcamadan düşer; kart borcu ödemesi ikinci kez gider değildir. Kalan tutar banka bakiyesi olarak sunulmaz.'),
        ('Geriye uyumluluk', 'IndexedDB adı, Android uygulama kimliği ve yedek formatı korunur. Varlık alanını bilmeyen eski profil, yeni varlıkları sessizce sıfırlamaz.'),
        ('Erişilebilir geri bildirim', 'Boş / hata / yükleniyor durumu, ayrı silme hedefi ve azaltılmış hareket desteği. Geri Al, açık diyalog varken onun içinde kalır; inert arka planda erişilemez olmaz.'),
    ], [115, CONTENT - 115]))
    story.append(PageBreak())

    story += heading('Firebase: ne çalışıyor?', 'Her ürün için mevcut uygulama rolü ile dış ortamda ayrıca doğrulanması gereken sınır ayrıdır.')
    story.append(table(['Ürün', 'Mizan’a özel kullanım ve durum'], [
        ('Authentication', '<b>Mevcut entegrasyon.</b> İsteğe bağlı Google / e-posta hesabı ve cihazlar arasında devam etme. Temel yerel kullanım hesap gerektirmez. Canlı giriş ve oturum dönüşü ayrıca denenir.'),
        ('Cloud Firestore', '<b>Mevcut eşitleme.</b> İşlem ve belgelerde ayrı kayıt; varlıklar profil belgesinde tutulur. Belge başına son tarihli yazım kazanır. Eski istemcide eksik varlık alanı yeni varlıkları sıfırlamaz.'),
        ('Remote Config', '<b>İstemci ve politika.</b> min_required_version, latest_version, update_url, update_message; Android / iOS için ayrı URL anahtarları. Minimum altında kapatılamaz ekran; isteğe bağlı güncellemede Daha Sonra. Geçerli önbellek çevrimdışı korunur.'),
        ('FCM + yerel bildirim', '<b>Mevcut taşıma katmanları.</b> Kart kesim / kayıt gününde cihaz veya bulut teslimi. Saat tercihi, kısa ay sınırı, kart kimliği ve tekrar gönderim koruması vardır. Gerçek cihaz teslimi yerel testlerden çıkarılamaz.'),
        ('Cloud Functions', '<b>Mevcut saatlik görev.</b> Europe/Istanbul saatinde izinli cihazlara FCM gönderir. 20:00 tercihi mevcut saatlik motorla çalışır; bu özellik için yeni ücretli servis veya dakikalık tarama gerekmez.'),
        ('Analytics', '<b>Açık cihaz izniyle etkin.</b> Adlandırılmış UX olayları; tutar, kart adı, dosya içeriği veya varlık miktarı parametresi yok. Web ölçümü için adres / yönlendiren bağlamı da hassas içerikten arındırılır. Canlı alım ayrıca doğrulanır.'),
        ('Performance Monitoring', '<b>Ayrı izinle süre ölçümü.</b> Sabit adlarla beş işlem süresi. Tanılama çerçevesi yalnız sabit, aynı kaynaklı adreste çalışır; ana ekranın hassas URL bağlamı taşınmaz. Otomatik HTTP / sayfa izleri kapalıdır.'),
    ], [115, CONTENT - 115]))
    story.append(p('Güncelleme yayın kuralı', 'h2'))
    story.append(p(f'Minimum <b>0.0.0</b>, son sürüm <b>{escape(app_version)}</b>: zorunlu güncelleme açılmaz. {escape(remote_config_status)} Yayın sürümü / kanıtı: <b>{escape(remote_config_version)}</b>. update_url_android ve update_url_ios gelecekte gerçek dağıtım adresleriyle doldurulur; web adresi native güncelleme adresi yerine kullanılmaz. Minimum yükseltilmeden hedef paket ve indirme akışı doğrulanır.'))
    story.append(p(link('Remote Config yükleme stratejileri', 'https://firebase.google.com/docs/remote-config/loading') + '  |  ' + link('Performance Web rehberi', 'https://firebase.google.com/docs/perf-mon/get-started-web'), 'small'))
    story.append(PageBreak())

    story += heading('Görünür sınırlar, güvenilir değerleme.', 'Eksik veri, sağlayıcı kesintisi ve henüz doğrulanmamış servisler kullanıcıdan saklanmaz.')
    story.append(p('Varlık verisi nasıl gelir?', 'h2'))
    story.append(p('Birincil kaynak Truncgil Finans’ın anahtarsız v4 JSON verisi; döviz / metal yedeği Frankfurter v2, ek döviz yedeği ExchangeRate-API açık uç noktasıdır. İsteklere kullanıcı kimliği veya portföy miktarı eklenmez. Yerel önbellek, hata halinde eldeki son geçerli veriyi kaynağı ve tarihiyle gösterebilir.'))
    story.append(p('Miktar altı ondalık basamaklı mikro birim tamsayısıdır. TL değeri hesaplamanın sonunda kuruşa yuvarlanır. Güncel fiyatı olmayan varlık sıfır sayılmaz; toplam eksik olarak işaretlenir. Çeyrek ziynet değeri Darphane’nin 1,754 g ve 916,6 milyem standardındaki metal içeriğine dayanır; kuyumcu alım / bozum fiyatı, işçilik veya prim değildir.'))
    story.append(table(['Öncelik / risk', 'Karşılık ve sonraki kabul kapısı'], [
        ('Yüksek: zorunlu güncelleme', 'Geçersiz sürüm veya güvensiz adres politikası reddedilir. Geçerli mağaza / dağıtım adresi görülmeden Android minimumu yükseltilmemeli. Yayında eski / güncel paket matrisi denenmeli.'),
        ('Yüksek: cihaz teslimi', 'Gerçek Android cihazda izin, pil tasarrufu, kilit ekranı, yeniden başlatma ve bildirimden karta dönüş kontrolü yapılmalı. Bildirim saati teslim garantisi değildir.'),
        ('Orta: kur kullanılabilirliği', 'Sağlayıcı şeması, CORS, TLS, zaman damgası ve zaman aşımı denetlenir. Günlük referans ile piyasa verisi etiketlenir; ücretsiz kaynak için SLA varsayılmaz.'),
        ('Orta: yerel saklama', 'IndexedDB yazımı geciktirilmeden başlatılır. Tarayıcı verisi silinmesi / cihaz kaybı için kullanıcı yedeği ve isteğe bağlı eşitleme önemini korur.'),
        ('Orta: eşzamanlı profil', 'Varlıklar tek profil belgesinde; iki cihazın eşzamanlı farklı varlık düzenlemesinde son yazım diğerini ezebilir. Sonraki adım varlık başına belge / çatışma çözümüdür; cihaz saat farkı da test edilir.'),
        ('Orta: native hata görünürlüğü', 'Web süre ölçümü native çökme yakalamaz. Crashlytics Android SDK / Gradle ve test çökmesi kurulumu bu sürümde tamamlanmış sayılmaz.'),
    ], [135, CONTENT - 135]))
    story.append(p('Hazır servis ile gelecek entegrasyonu ayır', 'h2'))
    story.append(p('<b>Crashlytics:</b> native çökme ve ANR için sonraki entegrasyon. <b>App Check:</b> Firestore / Functions kötüye kullanımını azaltmak için sağlayıcı anahtarı ve geçerli cihaz dağıtımıyla planlanmalı; gerçek kullanıcıları engellemeden gözlemle başlanmalı. <b>Cloud Storage:</b> yalnız kullanıcı açıkça bulut belge yedeği isterse; PDF’ler bugün cihazda ayrıştırılır, otomatik belge yüklenmez.'))
    story.append(PageBreak())

    story += heading('Bir sonraki doğru adım.', 'Önce kullanım kanıtı ve güvenilirlik; ardından karar vermeyi kolaylaştıran ürün derinliği.')
    story.append(table(['Ufuk', 'Özellik / değer', 'Başarıyı gösterecek kanıt'], [
        ('Yakın', '<b>Akıllı ekstre tamamlama.</b> Eksik ay-kart çiftlerinden tek adımda aktarım; yanlış kategori ve mutabakat farkı için yönlendirilmiş düzeltme.', 'Eksik ekstre tamamlama oranı; aktarım sonrası düzeltme ve geri alma oranı. Finansal içerik ölçüme taşınmaz.'),
        ('Yakın', '<b>Cihaz kabul paketi.</b> Yükseltmede veri koruma, bildirim saat matrisi, çevrimdışı giriş ve erişilebilirlik kontrolü; native Crashlytics denemesi.', 'İmzalı gerçek cihaz yükseltmesi; tekrar etmeyen bildirim; kaynaklı çökme / ANR raporu.'),
        ('Orta', '<b>Varlık geçmişi ve maliyet temeli.</b> Varlık alım lotları, değer geçmişi ve dönemsel fark. Fiyat değişimi ile kullanıcının alımını birbirinden ayır.', 'Alım / satış geçmişi tutarlılığı; kuruş / miktar yuvarlama senaryoları; anlaşılır gerçekleşen / gerçekleşmeyen fark.'),
        ('Orta', '<b>Ay kapanışı.</b> Gelir, gider, ekstre ve bütçeyi kısa bir kontrol listesiyle onaylama; aylık PDF / CSV özeti.', 'Kullanıcının ayı yardımsız kapatma süresi; sonradan bulunan eksik kayıt sayısı.'),
        ('Sonra', '<b>Özel senaryo planlayıcı.</b> Kira artışı, taksit bitişi ve hedef birikimini kullanıcı kontrollü varsayımlarla karşılaştır.', 'Varsayımların açık etiketlenmesi; tahmin-gerçek ayrımı; kullanıcı tarafından düzenlenen senaryo oranı.'),
    ], [55, 231, CONTENT - 286]))
    story.append(p('Teknik bakım öncelikleri', 'h2'))
    story.append(p('Kayıt / kart / varlık alanlarının geriye uyumluluk testlerini koru. Sağlayıcı yanıtlarını örnek fixture ile sözleşme testine bağla. Firebase maliyet ve hata panellerini ürün olaylarından ayır. Remote Config minimumunu yalnız dağıtılmış paket ve doğrulanmış indirme adresiyle birlikte yükselt.'))
    story.append(p('Kaynaklar ve yeniden üretim', 'h2'))
    for label, url in [
        ('Firebase ürün rehberleri', 'https://firebase.google.com/docs'),
        ('Truncgil Finans', 'https://finans.truncgil.com/'),
        ('Frankfurter v2', 'https://frankfurter.dev/'),
        ('ExchangeRate-API açık kaynak koşulları', 'https://www.exchangerate-api.com/docs/free'),
        ('Darphane Cumhuriyet altını standardı', 'https://www.darphane.gov.tr/cumhuriyet-altini-uretimi'),
    ]:
        story.append(p(link(label, url), 'small'))
    story.append(p('Kaynak dosyaları: docs/MIZAN_2_6_PLAN.md, docs/ASSET_DATA_SOURCES.md ve docs/FIREBASE_UPDATE_POLICY.md. Rapor üreticisi: docs/scripts/build_mizan_report.py. Sürüm ve doğrulama durumu üreticideki komut seçenekleriyle güncellenebilir.', 'small'))

    def page(canvas, document):
        canvas.saveState()
        canvas.setTitle('Mizan - Mimari ve Ürün Geliştirme Raporu')
        canvas.setAuthor('Mizan')
        canvas.setSubject('UX, kart yaşam döngüsü, Firebase ve varlık takibi')
        canvas.setFillColor(IRIS)
        canvas.roundRect(MARGIN, HEIGHT - 58, 23, 23, 6, fill=1, stroke=0)
        canvas.setStrokeColor(colors.white)
        canvas.setLineWidth(2.8)
        canvas.setLineCap(1)
        path = canvas.beginPath()
        path.moveTo(MARGIN + 6, HEIGHT - 52)
        path.lineTo(MARGIN + 6, HEIGHT - 42)
        path.lineTo(MARGIN + 11.5, HEIGHT - 48)
        path.lineTo(MARGIN + 17, HEIGHT - 42)
        path.lineTo(MARGIN + 17, HEIGHT - 52)
        canvas.drawPath(path)
        canvas.setFillColor(INK)
        canvas.setFont('Mizan-Bold', 13)
        canvas.drawString(MARGIN + 31, HEIGHT - 51, 'Mizan')
        canvas.setFont('Mizan', 8)
        canvas.setFillColor(MUTED)
        canvas.drawRightString(WIDTH - MARGIN, HEIGHT - 50, 'Ürün ve mimari notları / Kasım 2026')
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(.5)
        canvas.line(MARGIN, 42, WIDTH - MARGIN, 42)
        canvas.setFont('Mizan', 8)
        canvas.drawString(MARGIN, 28, f'Mizan {app_version} | Verinin doğruluğu, akışın sadeliği')
        canvas.drawRightString(WIDTH - MARGIN, 28, f'{document.page} / 5')
        canvas.restoreState()

    doc = BaseDocTemplate(str(OUT), pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=82, bottomMargin=58,
                          title='Mizan - Mimari ve Ürün Geliştirme Raporu', author='Mizan')
    frame = Frame(MARGIN, 58, CONTENT, HEIGHT - 140, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates(PageTemplate(id='Mizan', frames=[frame], onPage=page))
    doc.build(story)
    print(OUT)


if __name__ == '__main__':
    parser = ArgumentParser()
    parser.add_argument('--frontend-tests', type=int, required=True)
    parser.add_argument('--final-validation', required=True)
    parser.add_argument('--app-version', default='2.6.0')
    parser.add_argument('--remote-config-status', required=True)
    parser.add_argument('--remote-config-version', required=True)
    args = parser.parse_args()
    build(args.frontend_tests, args.final_validation, args.app_version, args.remote_config_status, args.remote_config_version)
