import { describe, expect, it } from "vitest";
import { createCategorizer } from "./categorize";
import { normalizeMerchant } from "../core/text";

describe("explicit merchant phrases before lossy processor normalization", () => {
  it("recognises Apple billing with punctuation and city noise", () => {
    const classify = createCategorizer();
    expect(classify("APPLE.COM/BILL CORK IRL")).toBe("subscription");
    expect(classify("APPLE.COM/BILL ITUNES.COM IRL")).toBe("subscription");
  });
  it("continues to honour the users category rule first", () => {
    const merchant = normalizeMerchant("APPLE.COM/BILL CORK IRL");
    const classify = createCategorizer([
      { id: "rule", merchant, category: "education", createdAt: 0 },
    ]);
    expect(classify("APPLE.COM/BILL CORK IRL")).toBe("education");
  });
  it("leaves ambiguous merchants unclassified", () => {
    expect(createCategorizer()("ARAS SHOP")).toBe("other");
  });
});
