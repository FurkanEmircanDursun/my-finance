import { parseTrAmount } from "../core/money";
import { daysInMonth, todayKey, type DayKey, type MonthKey } from "../core/date";
import { uid } from "../core/hash";
import { normalizeMerchant } from "../core/text";
import type { CategoryId } from "./categories";
import type { Transaction } from "./types";

export type EntryMethod = "Nakit" | "Banka / EFT" | "Diğer";
export interface EntryDraft {
  description: string;
  amount: string;
  date: string;
  category: CategoryId;
  kind: "expense" | "income";
  method: EntryMethod;
}

/** Start a new record inside its selected calendar month without UTC conversion. */
export function entryDateForPeriod(period: MonthKey | 'all', today: DayKey = todayKey()): DayKey {
  if (period === 'all' || period === today.slice(0, 7)) return today;
  if (!/^(?:19\d{2}|[2-9]\d{3})-(?:0[1-9]|1[0-2])$/.test(period)) return today;
  const day = Math.min(Number(today.slice(8, 10)), daysInMonth(period));
  return `${period}-${String(day).padStart(2, '0')}`;
}

/** Strict Turkish amount entry: reject malformed text instead of partially parsing it. */
export function entryAmount(input: string): number | null {
  const value = input.trim();
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(value)) return null;
  const minor = parseTrAmount(value);
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

export function createEntry(draft: EntryDraft): Transaction | null {
  const amount = entryAmount(draft.amount);
  const [year, month, day] = draft.date.split("-").map(Number);
  const validDate =
    /^\d{4}-\d{2}-\d{2}$/.test(draft.date) &&
    year >= 1900 &&
    year <= 9999 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(draft.date.slice(0, 7));
  if (amount === null || !draft.description.trim() || !validDate) return null;
  return {
    id: uid(),
    date: draft.date,
    description: draft.description.trim(),
    merchant: normalizeMerchant(draft.description),
    amount,
    kind: draft.kind,
    category: draft.category,
    categoryLocked: true,
    bank: "Manuel",
    accountLabel: draft.method,
    installment: null,
    source: "manual",
  };
}
