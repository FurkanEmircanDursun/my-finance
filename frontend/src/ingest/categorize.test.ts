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
  it("never misclassifies instalment wording TAKSIT as taxi transport", () => {
    const classify = createCategorizer();
    expect(classify("ORNEK MAGAZA 1.250,00x2=2.500,00 1.Taksit")).toBe("other");
    expect(classify("TAKSIDE POS")).toBe("transport");
  });
  it("distinguishes doctors from D&R bookstore and classifies ŞOK, fees, and restaurants accurately", () => {
    const classify = createCategorizer();
    expect(classify("DR. AHMET KAYA")).toBe("health");
    expect(classify("DR.COM.TR ISTANBUL")).toBe("education");
    expect(classify("ŞOK-5665 İSTANBUL FULYA M")).toBe("market");
    expect(classify("Eğitim Sağlık Kampanyası Ücreti")).toBe("fees");
    expect(classify("ORNEK REST. GIDA")).toBe("dining");
  });
});
