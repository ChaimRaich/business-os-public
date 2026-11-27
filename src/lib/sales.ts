/** One sold (or returned) item as the sales report shows it. Negative quantity is a return. */
export type SalesRow = {
  code: string;
  quantity: number;
  /** The item's name in the till, kept so an unknown code can be recognised. */
  item_name: string | null;
  transaction_ref: string | null;
  /** ISO timestamp, or null when the report has no usable date. */
  sold_at: string | null;
  unit_price: number | null;
};

/** Kept under the 1MB limit of a server action call. */
export const MAX_SALES_ROWS = 4000;

export const SALES_FIELDS = ["code", "quantity", "item_name", "transaction_ref", "sold_at", "unit_price"] as const;
export type SalesField = (typeof SALES_FIELDS)[number];

export const SALES_FIELD_LABELS: Record<SalesField, string> = {
  code: "ברקוד / קוד הפריט",
  quantity: "כמות",
  item_name: "שם הפריט",
  transaction_ref: "מספר עסקה",
  sold_at: "תאריך",
  unit_price: "מחיר ליחידה",
};

export const REQUIRED_SALES_FIELDS: SalesField[] = ["code", "quantity"];

const HEADER_HINTS: Record<SalesField, RegExp> = {
  code: /ברקוד|מק.?ט|קוד פריט|קוד מוצר|barcode|sku|item ?code/i,
  quantity: /כמות|יחידות|qty|quantity/i,
  item_name: /שם פריט|שם מוצר|תי?אור פריט|item ?name|description/i,
  transaction_ref: /עסקה|קבלה|חשבונית|מס.? ?מסמך|transaction|receipt|invoice/i,
  sold_at: /תאריך|date/i,
  unit_price: /מחיר|price/i,
};

/** Best guess of which column holds which field, by the header text. */
export function guessMapping(headers: string[]): Record<SalesField, number | null> {
  const taken = new Set<number>();
  const mapping = {} as Record<SalesField, number | null>;
  for (const field of SALES_FIELDS) {
    const index = headers.findIndex((header, i) => !taken.has(i) && HEADER_HINTS[field].test(header));
    mapping[field] = index === -1 ? null : index;
    if (index !== -1) taken.add(index);
  }
  return mapping;
}

/** A code cell as text. Excel hands over numbers; a barcode must not become "7.2E+11". */
export function cellText(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "number") {
    return Number.isInteger(cell) ? cell.toFixed(0) : String(cell);
  }
  if (cell instanceof Date) return cell.toISOString();
  return String(cell).trim();
}

/** "1,200.50" / "-1" / 3 -> number; empty -> null; anything else -> undefined. */
export function cellNumber(cell: unknown): number | null | undefined {
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : undefined;
  const cleaned = cellText(cell).replace(/[\s,₪]/g, "");
  if (cleaned === "") return null;
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : undefined;
}

/** A date cell, or day/month/year text as Israeli reports print it; null when unreadable. */
export function cellDate(cell: unknown): string | null {
  if (cell instanceof Date) {
    return Number.isNaN(cell.getTime()) ? null : cell.toISOString();
  }
  const text = cellText(cell);
  const match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (match) {
    const [, day, month, year, hour = "12", minute = "0", second = "0"] = match;
    const fullYear = year.length === 2 ? 2000 + Number(year) : Number(year);
    const date = new Date(fullYear, Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    // Rejects 31/02 and the like, which Date would silently roll over.
    return date.getMonth() === Number(month) - 1 && date.getDate() === Number(day) ? date.toISOString() : null;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

export type ParsedSales = {
  rows: SalesRow[];
  /** Lines that are not sales: blanks, totals, and items with a quantity of zero. */
  skipped: number;
  /** 1-based file line numbers that have a code but no usable quantity. */
  invalid: number[];
};

/** Turns the grid under the header row into sales rows, by the chosen columns. */
export function toSalesRows(
  grid: unknown[][],
  headerRow: number,
  mapping: Record<SalesField, number | null>,
): ParsedSales {
  const result: ParsedSales = { rows: [], skipped: 0, invalid: [] };
  const pick = (line: unknown[], field: SalesField) => (mapping[field] === null ? undefined : line[mapping[field]]);
  for (let index = headerRow + 1; index < grid.length; index += 1) {
    const line = grid[index] ?? [];
    const code = cellText(pick(line, "code"));
    const quantity = cellNumber(pick(line, "quantity"));
    // Blank lines; a quantity without a code is the report's total line; and the till
    // lists items whose sales and returns cancelled out with a quantity of zero.
    if (!code || quantity === 0) {
      result.skipped += 1;
      continue;
    }
    if (!quantity || code.length > 64) {
      result.invalid.push(index + 1);
      continue;
    }
    const price = cellNumber(pick(line, "unit_price"));
    result.rows.push({
      code,
      quantity,
      item_name: cellText(pick(line, "item_name")).slice(0, 200) || null,
      transaction_ref: cellText(pick(line, "transaction_ref")).slice(0, 64) || null,
      sold_at: cellDate(pick(line, "sold_at")),
      unit_price: typeof price === "number" ? Math.abs(price) : null,
    });
  }
  return result;
}

/** True when the timestamp is more than the given number of days in the past. */
export function isOlderThanDays(iso: string, days: number): boolean {
  return Date.now() - new Date(iso).getTime() > days * 86_400_000;
}
