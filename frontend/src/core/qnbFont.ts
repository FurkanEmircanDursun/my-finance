/**
 * Self-calibrating decoder for PDF subset fonts that emit Turkish special
 * letters as low control characters (\u0000–\u001f) with no ToUnicode CMap.
 *
 * QNB credit card statements embed regular and bold Latin text in normal
 * Unicode fonts, but place Turkish diacritic glyphs (Ö, ö, Ü, ü, Ş, ş, Ğ, ğ,
 * Ç, ç, İ) in a separate subset font whose glyph IDs arrive as raw control
 * bytes. Because subset glyph IDs can shift from document to document, this
 * decoder calibrates each document's control-byte map directly from fixed
 * Turkish statement cover, table-header, and footer labels rather than
 * hardcoding a single document's slot assignments.
 */

const CTRL_RE = /[\u0000-\u0008\u000e-\u001f]/
const CTRL_GLOBAL_RE = /[\u0000-\u0008\u000e-\u001f]/g

interface Anchor {
  re: RegExp
  letters: readonly string[]
}

const C = String.raw`([\u0000-\u0008\u000e-\u001f])`
/** Non-letter boundary: unlike \b, this works directly before/after control bytes. */
const B = String.raw`(?<![A-Za-zÇĞİÖŞÜçğıöşü])`
const E = String.raw`(?![A-Za-zÇĞİÖŞÜçğıöşü])`

/** Fixed Turkish cover, table-header, footer, and statement boilerplate anchors. */
const ANCHORS: readonly Anchor[] = [
  { re: new RegExp(String.raw`${B}Son\s+${C}deme\s+Tarihi`, 'g'), letters: ['Ö'] },
  { re: new RegExp(String.raw`${B}son\s+${C}deme\s+tarihiniz`, 'g'), letters: ['ö'] },
  { re: new RegExp(String.raw`${B}Asgari\s+${C}deme\s+Tutar`, 'g'), letters: ['Ö'] },
  { re: new RegExp(String.raw`${B}Asgari\s+${C}deme\s+Oran`, 'g'), letters: ['Ö'] },
  { re: new RegExp(String.raw`${B}D${C}nem\s+Borcu`, 'g'), letters: ['ö'] },
  { re: new RegExp(String.raw`${B}${C}nceki\s+D${C}nem`, 'g'), letters: ['Ö', 'ö'] },
  { re: new RegExp(String.raw`${B}M${C}${C}teri\s+Numaras`, 'g'), letters: ['ü', 'ş'] },
  { re: new RegExp(String.raw`${B}Hesap\s+${C}zetiniz`, 'g'), letters: ['Ö'] },
  { re: new RegExp(String.raw`${B}${C}demeler\s+ve`, 'g'), letters: ['Ö'] },
  { re: new RegExp(String.raw`${B}${C}deme\s*-\s*Tesekk${C}r`, 'g'), letters: ['Ö', 'ü'] },
  { re: new RegExp(String.raw`${B}${C}deme\s*-\s*Te${C}ekk${C}r`, 'g'), letters: ['Ö', 'ş', 'ü'] },
  { re: new RegExp(String.raw`${B}${C}${C}lem\s+Tarihi`, 'g'), letters: ['İ', 'ş'] },
  { re: new RegExp(String.raw`${B}${C}${C}lem\s+A${C}[ıi]klamas`, 'g'), letters: ['İ', 'ş', 'ç'] },
  { re: new RegExp(String.raw`${B}${C}cretler${E}`, 'g'), letters: ['Ü'] },
  { re: new RegExp(String.raw`${B}${C}creti${E}`, 'g'), letters: ['Ü'] },
  { re: new RegExp(String.raw`${B}${C}cretiniz${E}`, 'g'), letters: ['ü'] },
  { re: new RegExp(String.raw`${B}${C}cretsiz${E}`, 'g'), letters: ['ü'] },
  { re: new RegExp(String.raw`${B}Al[ıi]${C}veri${C}${E}`, 'g'), letters: ['ş', 'ş'] },
  { re: new RegExp(String.raw`${B}al[ıi]${C}veri${C}inizin\s+sipari${C}${E}`, 'g'), letters: ['ş', 'ş', 'ş'] },
  { re: new RegExp(String.raw`${B}Nakit\s+${C}ekim${E}`, 'g'), letters: ['Ç'] },
  { re: new RegExp(String.raw`${B}Bank\s+A\.${C}\.`, 'g'), letters: ['Ş'] },
  { re: new RegExp(String.raw`${B}B${C}y${C}k\s+M${C}kellefler`, 'g'), letters: ['ü', 'ü', 'ü'] },
  { re: new RegExp(String.raw`${B}B${C}y${C}kdere${E}`, 'g'), letters: ['ü', 'ü'] },
  { re: new RegExp(String.raw`${B}Bankac[ıi]l[ıi]${C}[ıi]`, 'g'), letters: ['ğ'] },
  { re: new RegExp(String.raw`${B}${C}i${C}li/${C}stanbul${E}`, 'g'), letters: ['Ş', 'ş', 'İ'] },
  { re: new RegExp(String.raw`${B}${C}i${C}li\s+${C}stanbul${E}`, 'g'), letters: ['Ş', 'ş', 'İ'] },
  { re: new RegExp(String.raw`(?:^|[\s/])${C}STANBUL${E}`, 'g'), letters: ['İ'] },
  { re: new RegExp(String.raw`\*S${C}ZLE${C}ME`, 'g'), letters: ['Ö', 'Ş'] },
  { re: new RegExp(String.raw`${B}DE${C}${C}${C}${C}KL${C}${C}${C}${E}`, 'g'), letters: ['Ğ', 'İ', 'Ş', 'İ', 'İ', 'Ğ', 'İ'] },
  { re: new RegExp(String.raw`${B}B${C}LD${C}R${C}M${C}${E}`, 'g'), letters: ['İ', 'İ', 'İ', 'İ'] },
  { re: new RegExp(String.raw`${B}se${C}meniz${E}`, 'g'), letters: ['ç'] },
  { re: new RegExp(String.raw`${B}di${C}er${E}`, 'g'), letters: ['ğ'] },
  { re: new RegExp(String.raw`${B}d${C}viz${E}`, 'g'), letters: ['ö'] },
  { re: new RegExp(String.raw`${B}${C}deme\s+tipinizi${E}`, 'g'), letters: ['ö'] },
  { re: new RegExp(String.raw`${B}${C}evrilerek${E}`, 'g'), letters: ['ç'] },
  { re: new RegExp(String.raw`${B}har${C}${E}`, 'g'), letters: ['ç'] },
  { re: new RegExp(String.raw`${B}bor${C}${E}`, 'g'), letters: ['ç'] },
  { re: new RegExp(String.raw`${B}i${C}leminizi${E}`, 'g'), letters: ['ş'] },
  { re: new RegExp(String.raw`${B}i${C}lemlerine${E}`, 'g'), letters: ['ş'] },
  { re: new RegExp(String.raw`${B}ili${C}kin${E}`, 'g'), letters: ['ş'] },
  { re: new RegExp(String.raw`${B}Kar${C}[ıi]l[ıi]`, 'g'), letters: ['ş'] },
  { re: new RegExp(String.raw`${B}ko${C}ullar[ıi]${E}`, 'g'), letters: ['ş'] },
  { re: new RegExp(String.raw`${B}${C}OK-\d`, 'g'), letters: ['Ş'] },
]

/** True when readable Latin text has Turkish letters replaced by low control bytes. */
export function looksLikeControlTurkish(text: string): boolean {
  if (!CTRL_RE.test(text)) return false
  const letters = text.match(/[A-Za-zÇĞİÖŞÜçğıöşü]/g)?.length ?? 0
  if (letters < 40) return false
  const controls = text.match(CTRL_GLOBAL_RE)?.length ?? 0
  return controls >= 3 && controls < text.length * 0.15
}

/**
 * Calibrates a control-byte -> Turkish letter map from the document's fixed
 * labels. Returns null when fewer than 3 distinct Turkish glyphs are proved,
 * so genuinely corrupt binary streams still fail validation as unreadable.
 */
export function buildControlTurkishMap(text: string): Map<string, string> | null {
  if (!looksLikeControlTurkish(text)) return null

  const votes = new Map<string, Map<string, number>>()
  const vote = (code: string, letter: string) => {
    let counts = votes.get(code)
    if (!counts) {
      counts = new Map()
      votes.set(code, counts)
    }
    counts.set(letter, (counts.get(letter) ?? 0) + 1)
  }

  for (const { re, letters } of ANCHORS) {
    re.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = re.exec(text)) !== null) {
      for (let i = 0; i < letters.length; i++) {
        const ch = match[i + 1]
        if (ch) vote(ch, letters[i])
      }
    }
  }

  if (votes.size < 3) return null

  const mapping = new Map<string, string>()
  for (const [code, counts] of votes) {
    let bestLetter = ''
    let bestCount = 0
    for (const [letter, count] of counts) {
      if (count > bestCount) {
        bestLetter = letter
        bestCount = count
      }
    }
    if (bestLetter) mapping.set(code, bestLetter)
  }

  return mapping
}

/** Creates a decoder function for one document, or null when no control-glyph font is detected. */
export function createControlTurkishDecoder(sample: string): ((text: string) => string) | null {
  const mapping = buildControlTurkishMap(sample)
  if (!mapping) return null
  return (text: string) =>
    text.replace(CTRL_GLOBAL_RE, (ch) => mapping.get(ch) ?? '')
}

export function decodeControlTurkish(text: string): string | null {
  const decode = createControlTurkishDecoder(text)
  return decode ? decode(text) : null
}
