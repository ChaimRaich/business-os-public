export type StockState = "negative" | "out" | "low" | "ok";

/** Worst first: the order the shortage screen lists them in. */
export const STOCK_STATES: StockState[] = ["negative", "out", "low", "ok"];

export const STOCK_STATE_LABELS: Record<StockState, string> = {
  negative: "במינוס",
  out: "אזל",
  low: "מתחת לסף",
  ok: "תקין",
};

export const STOCK_STATE_STYLES: Record<StockState, string> = {
  negative: "bg-danger-soft text-danger",
  out: "bg-danger-soft text-danger",
  low: "bg-warn-soft text-warn",
  ok: "bg-accent-soft text-accent-strong",
};

export const STOCK_STATE_ABOUT: Record<Exclude<StockState, "ok">, string> = {
  negative: "נמכר יותר ממה שנקלט במערכת. בדרך כלל חסרה קליטה או יתרת פתיחה; מתקנים בדף המוצר.",
  out: "לא נשארה אף יחידה.",
  low: "הכמות הגיעה לסף החוסר או ירדה ממנו.",
};

export function isStockState(value: unknown): value is StockState {
  return STOCK_STATES.includes(value as StockState);
}

/** Quantities are whole units almost always; show a fraction only when there is one. */
export const formatQuantity = (value: number) =>
  value.toLocaleString("en-US", { maximumFractionDigits: 3 });
