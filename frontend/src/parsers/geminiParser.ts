import { GoogleGenerativeAI } from "@google/generative-ai"
import type { Transaction } from "../types/finance"
import { categorizeTransaction } from "./categorizer"

// Kullanıcının sağladığı API key
const API_KEY = "AQ.Ab8RN6JrAivT93W6Or_1MuZoDdnSKJYwWJgZy_6ors1qxiLVcQ"

export async function parsePdfWithGemini(file: File, onProgress?: (msg: string) => void): Promise<{ bank: string, transactions: Transaction[] }> {
  if (onProgress) onProgress("Yapay Zeka (Gemini VLM) ile okunuyor...")

  const genAI = new GoogleGenerativeAI(API_KEY)
  const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" })

  // Browser'da hızlı base64 dönüşümü (ana thread'i dondurmaz)
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      // "data:application/pdf;base64,JVBER..." formatından sadece base64 kısmını al
      const b64 = dataUrl.split(',')[1]
      resolve(b64)
    }
    reader.onerror = () => reject(new Error("Dosya okunamadı"))
    reader.readAsDataURL(file)
  })

  const prompt = `Bu bir kredi kartı ekstresidir (PDF). İçindeki tüm harcama işlemlerini bul ve aşağıdaki JSON formatında bir dizi olarak dön. Başka hiçbir açıklama yazma, sadece JSON'ı dön.
JSON Formatı:
[
  {
    "bank": "Banka Adı (Örn: Akbank veya Garanti BBVA)",
    "date": "İşlem Tarihi (GG/AA/YYYY)",
    "description": "Açıklama (Örn: TRENDYOL.COM)",
    "amount": Tutar (Sayısal, iade ise eksi olmalı),
    "installment": "Varsa Taksit Bilgisi (Örn: 2/3), yoksa null"
  }
]
Dikkat: Taksitli işlemlerde, taksit tutarını değil ana (toplam) borç tutarını bul ve onu 'amount' olarak yaz.`

  try {
    if (onProgress) onProgress("Gemini API'ye gönderiliyor (2-3 saniye)...")

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64,
          mimeType: file.type || 'application/pdf'
        }
      }
    ])

    const text = result.response.text()
    
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim()
    const parsed = JSON.parse(jsonStr)

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("Gemini geçerli bir işlem listesi döndüremedi.")
    }

    // Add category & raw_line
    const transactions: Transaction[] = parsed.map(tx => ({
      ...tx,
      category: categorizeTransaction(tx.description),
      raw_line: `[Gemini VLM] ${tx.description} - ₺${tx.amount}`
    }))

    const bank = transactions[0].bank || 'Bilinmeyen Banka'
    
    return { bank, transactions }

  } catch (error: any) {
    console.error("Gemini Parse Error:", error)
    throw new Error("Yapay Zeka Analiz Hatası: " + (error.message || 'Bilinmeyen hata'))
  }
}
