import { describe, expect, it } from "vitest";
import { parseReceiptText } from "./ocr";
import { findReceiptDate } from "./ocr";

describe("parseReceiptText", () => {
  it("finds merchant and largest amount", () => {
    const r = parseReceiptText(["NASI PADANG SEDERHANA", "Jl. Merdeka No. 10", "TOTAL Rp 45.000", "10/10/2026"]);
    expect(r?.merchant).toBe("NASI PADANG SEDERHANA");
    expect(r?.amount).toBe("45000");
  });
  it("handles dotted thousands with decimal", () => {
    const r = parseReceiptText(["TOKOPEDIA", "Total Bayar Rp 1.467.000,00"]);
    expect(r?.amount).toBe("1467000");
  });
  it("returns null on empty input", () => {
    expect(parseReceiptText([])).toBeNull();
    expect(parseReceiptText(["   "])).toBeNull();
  });
});

describe("findReceiptDate", () => {
  it("parses id-style dates", () => {
    expect(findReceiptDate(["TOTAL Rp 45.000", "10/10/2026"])).toBe("2026-10-10");
    expect(findReceiptDate(["05-01-26"])).toBe("2026-01-05");
    expect(findReceiptDate(["no date here"])).toBe("");
  });
});
