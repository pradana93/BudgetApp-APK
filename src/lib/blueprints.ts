/** Budget blueprints: named multi-budget starter sets, one tap to create. */

export type BlueprintId = "household" | "duo" | "solo";

export interface Blueprint {
  id: BlueprintId;
  items: { en: string[]; id: string[] };
}

export const BLUEPRINTS: Blueprint[] = [
  {
    id: "household",
    items: {
      en: ["Rent", "Groceries", "Transport", "Utilities"],
      id: ["Sewa", "Belanja", "Transport", "Utilitas"],
    },
  },
  {
    id: "duo",
    items: {
      en: ["Groceries", "Date nights", "Transport", "Savings"],
      id: ["Belanja", "Kencan", "Transport", "Tabungan"],
    },
  },
  {
    id: "solo",
    items: {
      en: ["Rent", "Food", "Transport", "Fun"],
      id: ["Sewa", "Makan", "Transport", "Hiburan"],
    },
  },
];

/** First and last ISO day of the current month (local time). */
export function currentMonthRange(): { start: string; end: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return { start, end: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(last)}` };
}
