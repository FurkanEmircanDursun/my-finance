import { fold } from '../core/text'
import { addMonths, todayKey, type DayKey } from '../core/date'

export interface ImportReviewWarning {
  code:
    | 'different_holder_account'
    | 'different_holder_existing'
    | 'mixed_batch_holders'
    | 'stale_statement'
    | 'missing_card_last4'
  severity: 'warning' | 'caution'
  title: string
  detail: string
  /** When true, the user must explicitly acknowledge the warning before saving. */
  requiresExplicitConfirm?: boolean
  /** Exact cardholder name the user must type to confirm importing a foreign statement. */
  expectedConfirmName?: string
}

const HONORIFICS = new Set([
  'SAYIN',
  'SN',
  'BAY',
  'BAYAN',
  'MR',
  'MRS',
  'MS',
  'DR',
  'PROF',
  'AV',
  'MUH',
])

const BOILERPLATE_WORDS = new Set([
  'AKBANK',
  'GARANTI',
  'BBVA',
  'AXESS',
  'BONUS',
  'PLATINUM',
  'GOLD',
  'WINGS',
  'TURKIYE',
  'BANKASI',
  'BANKA',
  'KREDI',
  'KARTI',
  'KART',
  'HESAP',
  'OZETI',
  'EKSTRE',
  'EKSTRESI',
  'DONEM',
  'BORCU',
  'BORCUNUZ',
  'TUTARI',
  'LIMIT',
  'LIMITI',
  'MUSTERI',
  'NUMARASI',
  'ADRES',
  'ADRESI',
  'CADDE',
  'CADDESI',
  'SOKAK',
  'SOKAGI',
  'MAHALLE',
  'MAHALLESI',
  'BULVAR',
  'BULVARI',
  'ISTANBUL',
  'ANKARA',
  'IZMIR',
  'BURSA',
  'ANTALYA',
  'SUBE',
  'SUBESI',
  'TARIHI',
  'ODEME',
  'ISLEM',
  'TAKSIT',
  'TOPLAM',
  'BAKIYE',
  'BILGILERI',
  'BILGILERINIZ',
  'GENEL',
  'MUDURLUK',
  'MUDURLUGU',
  'TICARET',
  'ANONIM',
  'SIRKETI',
  'MERSIS',
  'VERGI',
  'DAIRESI',
  'TELEFON',
  'EPOSTA',
  'INTERNET',
  'SUBEMIZ',
  'SAYFA',
  'TRENDYOL',
  'MAXIMUM',
  'PARAF',
  'QNB',
  'ISBANK',
  'DUNYA',
  'KATILIM',
  'TROY',
  'VISA',
  'MASTERCARD',
  'CLASSIC',
  'FLEXI',
  'DIJITAL',
  'OGRENCI',
  'GENC',
  'MUSTERIMIZ',
])

const TRAILING_CUT_RE =
  /\b(?:MUSTERI|HESAP|KART|SON\s+ODEME|DONEM|LIMIT|T\.?C\.?|TCKN|NO\b|NUMARASI|SUBE|TARIH|ADRES|SAYFA)\b.*$/i

function cleanCandidateName(raw: string): string | undefined {
  // Trim trailing known cover labels that can sit on the same columnar row.
  const withoutTrailing = raw
    .replace(/\t+/g, '   ')
    .split(/\s{3,}/)[0]
    .replace(/^[\s:;,\-–—.|•]+|[\s:;,\-–—.|•]+$/g, '')

  const foldedProbe = fold(withoutTrailing)
  const cutMatch = TRAILING_CUT_RE.exec(foldedProbe)
  const clipped = cutMatch
    ? withoutTrailing.slice(0, cutMatch.index).trim()
    : withoutTrailing.trim()

  // Strip leading honorifics like "Sayın" or "Sn."
  const stripped = clipped
    .replace(/^(?:SAYIN|Sayın|sayın|SN\.?|Sn\.?|MR\.?|MRS\.?|MS\.?)\s+/i, '')
    .replace(/[\s,;.:-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (stripped.length < 5 || stripped.length > 72) return undefined
  // Names never contain digits, currency symbols, slashes, or @ signs.
  if (/[\d₺$€%/@#*=+()[\]{}]/.test(stripped)) return undefined

  const tokens = stripped.split(' ').filter(Boolean)
  if (tokens.length < 2 || tokens.length > 5) return undefined

  const meaningful: string[] = []
  for (const token of tokens) {
    const cleanToken = token.replace(/\.$/, '')
    const folded = fold(cleanToken)
    if (!/^[A-Z]+$/.test(folded)) return undefined
    if (HONORIFICS.has(folded)) continue
    if (BOILERPLATE_WORDS.has(folded)) return undefined
    if (folded.length === 1 && !token.endsWith('.')) return undefined
    meaningful.push(cleanToken)
  }

  // Must have at least 2 name tokens and at least one token of length >= 2 (surname)
  if (meaningful.length < 2) return undefined
  if (meaningful.filter((t) => fold(t).length >= 2).length < 2) return undefined

  return formatDisplayName(stripped)
}

function formatDisplayName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLocaleLowerCase('tr-TR')
      return lower.charAt(0).toLocaleUpperCase('tr-TR') + lower.slice(1)
    })
    .join(' ')
}

/**
 * Extracts the cardholder name printed on a bank statement cover when
 * unambiguously labelled ("Sayın …", "Sn. …", "Kart Hamili", "Kart Sahibi",
 * "Müşteri Adı", "Asıl Kart", or Akbank's masked-card "… Harcamaları" header).
 * Returns `undefined` when no reliable holder label is present (e.g. generic CSVs).
 */
export function extractCardholderName(text: string): string | undefined {
  const rawLines = text
    .replace(/\r/g, '')
    .split('\n')
    .slice(0, 75)
    .map((line) => line.trim())
    .filter(Boolean)

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]
    const folded = fold(line)

    // Pattern 1: "SAYIN …" or "Sn. …" anywhere on a cover row (columnar covers
    // often place "Müşteri Numarası … Sayın …" or "Hesap Kesim Tarihi … Sayın …").
    const salutation = /(?:^|\s)(?:say[ıiİI]n|sn\.)[\s:.,-]*(.*)$/i.exec(line)
    if (salutation) {
      const after = salutation[1].trim()
      if (after) {
        const candidate = cleanCandidateName(after)
        if (candidate) return candidate
      } else if (rawLines[i + 1]) {
        const nextLine = cleanCandidateName(rawLines[i + 1])
        if (nextLine) return nextLine
      }
    }

    // Pattern 2: "KART HAMILI : ...", "KART SAHIBI : ...", "MUSTERI ADI SOYADI : ...", "AD SOYAD : ..."
    const labelMatch =
      /^(?:KART\s+(?:HAMILI|SAHIBI)(?:\s+ADI(?:\s+SOYADI)?)?|MUSTERI\s+ADI(?:\s+SOYADI)?|HESAP\s+SAHIBI|ADI?\s+SOYADI)\s*[:\-]?\s*(.*)$/.exec(
        folded,
      )
    if (labelMatch) {
      const inlineOffset = line.length - labelMatch[1].length
      const inlineRaw = labelMatch[1] ? line.slice(Math.max(0, inlineOffset)).trim() : ''
      if (inlineRaw) {
        const candidate = cleanCandidateName(inlineRaw)
        if (candidate) return candidate
      }
      if (rawLines[i + 1]) {
        const nextLine = cleanCandidateName(rawLines[i + 1])
        if (nextLine) return nextLine
      }
    }

    // Pattern 3: Akbank card-section heading ("**** **** **** 1234 AD SOYAD Harcamaları")
    const akbankSpendHeader = /[*•●]{4}[\s*•●\d]{4,24}\d{4}\s+(.+?)\s+harcamalar[ıiİIy]?\b/i.exec(line)
    if (akbankSpendHeader) {
      const candidate = cleanCandidateName(akbankSpendHeader[1].replace(/\s+/g, ' '))
      if (candidate) return candidate
    }

    // Pattern 4: QNB card-section heading ("ASIL KART: 4000 00** **** 1234 - AD SOYAD")
    const primaryCardHeader = /as[ıiİI]l\s+kart\s*:?\s*[\d*•●\s-]{12,24}-\s*(.+)$/i.exec(line)
    if (primaryCardHeader) {
      const candidate = cleanCandidateName(primaryCardHeader[1].replace(/\s+/g, ' '))
      if (candidate) return candidate
    }
  }

  return undefined
}

function nameTokens(raw: string): string[] {
  return fold(raw)
    .replace(/[^A-Z\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 1 && !HONORIFICS.has(token))
}

/**
 * Returns true if the string looks like a real person's full name (at least two
 * alphabetic words, not an email address or handle).
 */
export function isComparablePersonName(raw: string | null | undefined): raw is string {
  if (!raw) return false
  const trimmed = raw.trim()
  if (!trimmed || trimmed.includes('@') || /\d/.test(trimmed)) return false
  const tokens = nameTokens(trimmed).filter((t) => t.length >= 2)
  return tokens.length >= 2
}

/**
 * Compares two Turkish personal names tolerantly for middle names and initials,
 * while strictly distinguishing different family members sharing a surname
 * (e.g. "Ayşe Dursun" vs "Furkan Dursun" returns `false`).
 */
export function namesLikelyMatch(a: string, b: string): boolean {
  const ta = nameTokens(a)
  const tb = nameTokens(b)
  if (ta.length < 2 || tb.length < 2) return true

  const fullA = ta.filter((t) => t.length >= 2)
  const fullB = tb.filter((t) => t.length >= 2)
  if (fullA.length === 0 || fullB.length === 0) return true

  // Surnames (last token) must match or appear in the other name (double surnames).
  const surnameA = ta[ta.length - 1]
  const surnameB = tb[tb.length - 1]
  const surnameMatches =
    surnameA === surnameB || tb.includes(surnameA) || ta.includes(surnameB)
  if (!surnameMatches) return false

  // Given names (everything before surname) must have at least one direct or initial match.
  const givenA = ta.slice(0, -1)
  const givenB = tb.slice(0, -1)
  for (const ga of givenA) {
    for (const gb of givenB) {
      if (ga === gb) return true
      if ((ga.length === 1 && gb.startsWith(ga)) || (gb.length === 1 && ga.startsWith(gb))) {
        return true
      }
    }
  }
  return false
}

export interface AssessImportWarningsInput {
  cardholderName?: string
  accountDisplayName?: string | null
  existingCardholders: readonly string[]
  batchCardholders: readonly string[]
  periodEnd: DayKey | null
  reportedCardLast4?: string
  sameBankCardCount?: number
  today?: DayKey
}

export interface OwnershipMismatch {
  code: 'different_holder_account' | 'different_holder_existing' | 'mixed_batch_holders'
  title: string
  detail: string
  expectedConfirmName: string
}

/**
 * Checks whether the user's typed confirmation matches the printed cardholder
 * name on the foreign statement, tolerating Turkish case/diacritics and extra spaces.
 */
export function matchesTypedCardholderName(typed: string, expected: string): boolean {
  const normalize = (value: string) =>
    fold(value)
      .replace(/[^A-Z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  const expectedNorm = normalize(expected)
  if (!expectedNorm) return false
  return normalize(typed) === expectedNorm
}

/**
 * Detects when a statement's printed cardholder disagrees with the signed-in
 * account name, previously imported statements, or another statement in the
 * same batch. Interactive imports require the user to type the detected
 * cardholder's exact name to confirm; non-interactive imports refuse it.
 */
export function findOwnershipMismatch(input: {
  cardholderName?: string
  accountDisplayName?: string | null
  existingCardholders: readonly string[]
  batchCardholders: readonly string[]
}): OwnershipMismatch | null {
  const holder = input.cardholderName?.trim()
  if (!holder) return null

  if (
    isComparablePersonName(input.accountDisplayName) &&
    !namesLikelyMatch(holder, input.accountDisplayName)
  ) {
    return {
      code: 'different_holder_account',
      title: 'Yüklediğiniz ekstre başka bir kişi adına kayıtlı',
      detail: `Bu ekstre "${holder}" adına kayıtlı görünüyor (hesabınız "${input.accountDisplayName}" adına). Başkasına ait ekstre eklemek harcama ve analizlerinizi karıştırabilir. Buna rağmen yüklemek istiyor musunuz?`,
      expectedConfirmName: holder,
    }
  }

  const priorMismatch = input.existingCardholders.find(
    (existing) => isComparablePersonName(existing) && !namesLikelyMatch(holder, existing),
  )
  if (priorMismatch) {
    return {
      code: 'different_holder_existing',
      title: 'Yüklediğiniz ekstre başka bir kişi adına kayıtlı',
      detail: `Bu ekstre "${holder}" adına kayıtlı görünüyor; hesabınızdaki ekstreler "${priorMismatch}" adına. Başkasına ait ekstre eklemek analizlerinizi karıştırabilir. Buna rağmen yüklemek istiyor musunuz?`,
      expectedConfirmName: holder,
    }
  }

  const batchMismatch = input.batchCardholders.find(
    (other) => isComparablePersonName(other) && !namesLikelyMatch(holder, other),
  )
  if (batchMismatch) {
    return {
      code: 'mixed_batch_holders',
      title: 'Pakette farklı kişilere ait ekstreler var',
      detail: `Bu ekstre "${holder}" adına kayıtlı görünüyor; bu paketteki diğer ekstre "${batchMismatch}" adına. Farklı kişilerin ekstrelerini aynı hesaba yüklemek analizlerinizi karıştırabilir. Buna rağmen yüklemek istiyor musunuz?`,
      expectedConfirmName: holder,
    }
  }

  return null
}

/**
 * Evaluates ownership mismatches and high-impact edge cases for a parsed statement.
 */
export function assessStatementWarnings(
  input: AssessImportWarningsInput,
): ImportReviewWarning[] {
  const warnings: ImportReviewWarning[] = []
  const mismatch = findOwnershipMismatch(input)
  if (mismatch) {
    warnings.push({
      code: mismatch.code,
      severity: 'warning',
      title: mismatch.title,
      detail: mismatch.detail,
      requiresExplicitConfirm: true,
      expectedConfirmName: mismatch.expectedConfirmName,
    })
  }

  // Old statement check (> 18 months old)
  const today = input.today ?? todayKey()
  if (input.periodEnd) {
    const cutoffMonth = addMonths(today.slice(0, 7), -18)
    if (input.periodEnd.slice(0, 7) < cutoffMonth) {
      warnings.push({
        code: 'stale_statement',
        severity: 'caution',
        title: 'Eski tarihli ekstre',
        detail: `Bu ekstrenin kesim tarihi (${input.periodEnd}) 18 aydan daha eski. Yanlışlıkla eski bir arşiv dosyasını seçmediğinden emin ol.`,
      })
    }
  }

  // Multiple saved cards in the same bank without printed last4 on statement
  if (!input.reportedCardLast4 && (input.sameBankCardCount ?? 0) > 1) {
    warnings.push({
      code: 'missing_card_last4',
      severity: 'caution',
      title: 'Kart son 4 hanesi belgede okunamadı',
      detail: 'Aynı bankada birden fazla kartın kayıtlı. Ekstrenin doğru kartla eşleştiğini aşağıdan kontrol et.',
    })
  }

  return warnings
}
