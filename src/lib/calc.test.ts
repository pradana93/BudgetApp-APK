import { describe, expect, it } from "vitest";
import { evaluateExpression, hasCalcOps, groupDigits } from "./calc";

describe("evaluateExpression", () => {
  it("adds and subtracts", () => {
    expect(evaluateExpression("50000+25000")).toBe("75000");
    expect(evaluateExpression("50000+25000-10000")).toBe("65000");
  });
  it("handles leading minus and lone numbers", () => {
    expect(evaluateExpression("-5000+15000")).toBe("10000");
    expect(evaluateExpression("42000")).toBe("42000");
  });
  it("rejects garbage", () => {
    expect(evaluateExpression("")).toBeNull();
    expect(evaluateExpression("+")).toBeNull();
    expect(evaluateExpression("abc")).toBeNull();
  });
  it("avoids float artifacts", () => {
    expect(evaluateExpression("0,1+0,2")).toBe("0.3");
  });
});

describe("hasCalcOps", () => {
  it("detects interior operators only", () => {
    expect(hasCalcOps("50000+25000")).toBe(true);
    expect(hasCalcOps("-5000")).toBe(false);
    expect(hasCalcOps("42000")).toBe(false);
  });
});

describe("groupDigits", () => {
  it("groups thousands and strips leading zeros", () => {
    expect(groupDigits("1500000")).toBe("1.500.000");
    expect(groupDigits("0075")).toBe("75");
    expect(groupDigits("")).toBe("0");
  });
});
