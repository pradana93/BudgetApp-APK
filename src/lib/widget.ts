import * as React from "react";
import { Capacitor } from "@capacitor/core";
import { formatMoney } from "@/lib/money";

export type BudgetLike = {
  total_amount: number | string;
  allocated_amount: number | string;
  currency?: string | null;
};
export type RequestLike = { status: string };

/**
 * Pushes a home-widget snapshot (available total + pending count) into
 * SharedPreferences via the bundled native plugin. Native-only, silent.
 */
export function useWidgetSnapshot(
  budgets: BudgetLike[] | null | undefined,
  requests: RequestLike[] | null | undefined
): void {
  const payload = React.useMemo(() => {
    if (!budgets) return null;
    let total = 0;
    let allocated = 0;
    for (const b of budgets) {
      total += Number(b.total_amount) || 0;
      allocated += Number(b.allocated_amount) || 0;
    }
    const pending = (requests ?? []).filter((r) => r.status === "pending").length;
    const currency = budgets[0]?.currency ?? "IDR";
    return JSON.stringify({
      available: formatMoney(total - allocated, currency),
      pending,
      updated: new Date().toISOString(),
    });
  }, [budgets, requests]);

  React.useEffect(() => {
    if (!payload) return;
    if (!Capacitor.isNativePlatform()) return;
    (async () => {
      try {
        const proxy = Capacitor.registerPlugin<{ pushWidgetSnapshot(o: { json: string }): Promise<void> }>(
          "NativeExtras"
        );
        await proxy.pushWidgetSnapshot({ json: payload });
      } catch {
        // Widget sync is best-effort.
      }
    })();
  }, [payload]);
}
