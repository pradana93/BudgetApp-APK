/**
 * Tiny calculator engine for the amount keypad: "50000+25000-10000".
 * Integer-first (IDR has no minor units in practice).
 */

/** Evaluate a simple digit/operator expression. Returns null when invalid. */
export function evaluateExpression(expr: string): string | null {
  if (!expr) return null;
  const norm = expr.replace(/,/g, ".").replace(/[^0-9+\-.]/g, "");
  if (!norm || !/\d/.test(norm)) return null;
  const parts = norm.split(/([+-])/).filter(Boolean);
  let result: number | null = null;
  let sign = 1;
  for (const p of parts) {
    if (p === "+") sign = 1;
    else if (p === "-") sign = -1;
    else {
      const n = Number(p);
      if (!Number.isFinite(n)) return null;
      if (result === null) result = n * sign;
      else result += n * sign;
      sign = 1;
    }
  }
  if (result === null || !Number.isFinite(result)) return null;
  return String(Math.round(result * 100) / 100);
}

/** True when the expression contains an operator (ignoring a leading minus). */
export function hasCalcOps(digits: string): boolean {
  return /[+-]/.test(digits.replace(/^-/, ""));
}

/** Group an integer string per id-ID thousands. */
export function groupDigits(digits: string): string {
  const clean = digits.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "");
  if (!clean) return "0";
  return new Intl.NumberFormat("id-ID").format(Number(clean));
}
