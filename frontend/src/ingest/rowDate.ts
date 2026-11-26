import { parseSlashDate, parseTurkishLongDate } from '../core/date'

export const STATEMENT_ROW =
  /^(\d{1,2}(?:[./-]\d{1,2}[./-]|\s+\p{L}+\s+)\d{4})(?:(?:\s+|(?=[A-Za-zÇĞİÖŞÜçğıöşü0-9]))(.*))?$/u

export function parseStatementRowDate(value: string) {
  return parseTurkishLongDate(value) ?? parseSlashDate(value.replace(/-/g, '/'))
}

/** Catch broken dates on rows with an amount without guessing OCR digits. */
export function hasUnrecognisedRowDate(line: string): boolean {
  return /^[\dOoIl]{1,2}[./-][\dOoIl]{1,2}[./-][\dOoIl]{2,4}\s+\S/i.test(line) &&
    /\d[.,]\d{2}(?!\d)/.test(line)
}
