import { describe, expect, it } from "vitest";
import { createEntry, entryAmount } from "./entry";
import { applyFilters } from "../store/selectors";
import { emptyFilters, spendAmount } from "./types";

describe("household entries", () => {
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
