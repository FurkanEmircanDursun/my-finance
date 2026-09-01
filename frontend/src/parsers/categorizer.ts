/**
 * Kural tabanlı kategorizasyon — CATEGORIES sözlüğü ile merchant eşleştirme.
 * Python'daki categorizer.py'nin birebir TypeScript karşılığı.
 */

const CATEGORIES: Record<string, RegExp[]> = {
  'Market': [/M[İI]GROS/i, /\bA101\b/i, /B[İI]M\b/i, /CARREFOUR/i, /ŞOK\b/i, /MARKET/i, /BAKKAL/i],
  'Yeme & İçme': [/UBER\s*EATS/i, /YEMEKSEPETI/i, /GETİRYEMEK/i, /TRENDYOL\s*GO/i, /RESTORAN/i, /\bCAFE\b/i, /PİZZA/i, /PIZZA/i, /BURGER/i, /MUTFA[ĞG]I/i, /ÇAPARİ/i, /DONDURMA/i, /KAHVECISI/i, /YEMEKPAY/i],
  'Abonelik': [/NETFLIX/i, /SPOTIFY/i, /YOUTUBE/i, /EXXEN/i, /GAİN\b/i, /AMAZON\s*PRIME/i, /MAKROMUSIC/i, /GOOGLE\s*\*YOUTUBE/i],
  'E-Ticaret': [/TRENDYOL/i, /HEPSIBURADA/i, /\bN11\b/i, /\bAMAZON\b/i],
  'Fatura & Telekom': [/\bAVEA\b/i, /TURKCELL/i, /VODAFONE/i, /\bTTNET\b/i, /SUPERONLINE/i, /İSKİ/i, /İSKİFÖ/i, /\bAESAŞ\b/i, /\bFATURA\b/i, /\bTELCOM\b/i, /PAYCELL.*FATURA/i],
  'Ulaşım & Araç': [/PETROL\s*OFİSİ/i, /\bOPET\b/i, /\bSHELL\b/i, /\bBELBİM\b/i, /ISTANBULKART/i, /\bOBİLET\b/i, /\bAJET\b/i, /\bTHY\b/i, /PEGASUS/i, /\bMARTI\b/i, /IYZICO.*ISTANBUL/i],
  'Sağlık': [/MEDİCANA/i, /ECZANE/i, /HASTANE/i, /SAĞLIK/i],
  'Eğitim & Kitap': [/KİTAP/i, /KIRTASİYE/i, /KİTAPEVİ/i],
  'Finans & Cüzdan': [/\bPAYCELL\b/i, /MONEYPAY/i, /PAYNKOLAY/i, /\bIYZICO\b/i],
}

export function categorizeTransaction(description: string): string {
  const upper = description.toUpperCase()
  for (const [cat, patterns] of Object.entries(CATEGORIES)) {
    for (const pat of patterns) {
      if (pat.test(upper)) return cat
    }
  }
  return 'Diğer'
}
