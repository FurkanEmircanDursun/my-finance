import { describe, expect, it } from "vitest";
import { createEntry, entryAmount, entryDateForPeriod } from "./entry";
import { applyFilters } from "../store/selectors";
import { emptyFilters, spendAmount } from "./types";
import { initialState, reducer } from "../store/state";

describe("household entries", () => {
  it("starts a historical record in the selected month, clamping month-end and leap days", () => {
    expect(entryDateForPeriod("2026-10", "2026-11-14")).toBe("2026-10-14");
    expect(entryDateForPeriod("2026-02", "2026-03-31")).toBe("2026-02-28");
    expect(entryDateForPeriod("2024-02", "2026-03-31")).toBe("2024-02-29");
    expect(entryDateForPeriod("2025-12", "2026-01-01")).toBe("2025-12-01");
    expect(entryDateForPeriod("2026-11", "2026-11-14")).toBe("2026-11-14");
    expect(entryDateForPeriod("all", "2026-11-14")).toBe("2026-11-14");
    expect(entryDateForPeriod("2026-99", "2026-11-14")).toBe("2026-11-14");
  });
  it("keeps income and expenses in an explicitly edited date's month", () => {
    const draft = {
      description: "Geçmiş ay kaydı", amount: "1.250,50", date: "2026-09-30",
      category: "other" as const, method: "Banka / EFT" as const,
    };
    const income = createEntry({ ...draft, kind: "income" })!;
    const expense = createEntry({ ...draft, kind: "expense" })!;
    expect([income.date, expense.date]).toEqual(["2026-09-30", "2026-09-30"]);
    const context = { statements: [], periodGrouping: "calendar" as const };
    expect(applyFilters([income, expense], { ...emptyFilters, month: "2026-09", includeNonSpend: true }, context)).toHaveLength(2);
    expect(applyFilters([income, expense], { ...emptyFilters, month: "2026-11", includeNonSpend: true }, context)).toHaveLength(0);
  });
  it("restores a deleted statement record without losing card, billing date or refund identity", () => {
    const row = {
      ...createEntry({ description: "Kart iadesi", amount: "125,50", date: "2026-08-31", category: "market", method: "Nakit", kind: "expense" })!,
      source: "statement" as const, kind: "refund" as const, cardId: "card-a", statementId: "statement-a", billedOn: "2026-09-10",
    };
    const saved = reducer(initialState, { type: "addManualBatch", transactions: [row] });
    const removed = reducer(saved, { type: "deleteTransactions", ids: [row.id] });
    expect(removed.transactions).toEqual([]);
    const restored = reducer(removed, { type: "addManualBatch", transactions: [row] });
    expect(restored.transactions).toEqual([row]);
    expect(reducer(restored, { type: "addManualBatch", transactions: [row] }).transactions).toEqual([row]);
  });
  it("accepts Turkish amounts without silently truncating malformed input", () => {
    expect(entryAmount("1.250,50")).toBe(125050);
    expect(entryAmount("1250,5")).toBe(125050);
    expect(entryAmount("50")).toBe(5000);
    for (const raw of [
      "1.25",
      "1,234",
      "12abc",
      "-10",
      "0",
      "Infinity",
      "1.2.3",
      "9999999999999999",
    ])
      expect(entryAmount(raw)).toBeNull();
  });
  it("keeps rent and cash alongside card spend while excluding debt repayments", () => {
    const rent = createEntry({
      description: "Kira",
      amount: "15.000",
      date: "2026-10-01",
      kind: "expense",
      category: "rent",
      method: "Banka / EFT",
    })!;
    const cash = createEntry({
      description: "Kahve",
      amount: "75,50",
      date: "2026-10-15",
      kind: "expense",
      category: "dining",
      method: "Nakit",
    })!;
    const card = {
      ...cash,
      id: "card",
      source: "statement" as const,
      amount: 20000,
    };
    const payment = {
      ...card,
      id: "payment",
      kind: "payment" as const,
      amount: 100000,
    };
    const nextMonth = { ...cash, id: "next", date: "2026-11-01" };
    const rows = applyFilters(
      [rent, cash, card, payment, nextMonth],
      { ...emptyFilters, month: "2026-10", includeNonSpend: true },
      { statements: [], periodGrouping: "calendar" },
    );
    expect(rows.reduce((sum, tx) => sum + spendAmount(tx), 0)).toBe(1527550);
    expect(rent.accountLabel).toBe("Banka / EFT");
    expect(cash.accountLabel).toBe("Nakit");
  });
  it("rejects invalid dates and empty labels", () => {
    const draft = {
      description: "Kira",
      amount: "100",
      date: "2026-02-30",
      kind: "expense" as const,
      category: "rent" as const,
      method: "Nakit" as const,
    };
    expect(createEntry(draft)).toBeNull();
    expect(
      createEntry({ ...draft, date: "2026-10-01", description: "  " }),
    ).toBeNull();
  });
});
