import * as XLSX from "xlsx";

/** One row of the till file, as create_pos_export stored it. */
export type PosExportRow = {
  barcode: string;
  item_name: string;
  sale_price: number;
  club_price: number;
  supplier_code: string;
  supplier_name: string;
  department_code: string;
  department: string;
  sub_department: string;
  cost: number;
  quantity: number;
};

// Exactly as in the file the till accepted (SPEC 13.4), including the quote mark in מע"מ.
export const POS_HEADERS = [
  "ברקוד",
  "שם פריט",
  "מחיר מכירה",
  "שם מחירון",
  "מחיר מועדון",
  "קוד ספק",
  "שם ספק ראשי",
  "קוד מחלקה",
  "מחלקה",
  "תת מחלקה",
  'מחיר עלות ללא מע"מ',
  "כמות",
] as const;

export const POS_PRICE_LIST = "מועדון";

/** The till's codes are numbers in the sample file; anything else stays text. */
const numeric = (code: string) => (/^[1-9]\d{0,14}$/.test(code) ? Number(code) : code);

/** Excel 97-2003 (.xls), one sheet, a header row, barcode as text. */
export function buildPosWorkbook(rows: PosExportRow[], sheetName: string): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet([
    [...POS_HEADERS],
    ...rows.map((row) => [
      String(row.barcode),
      row.item_name,
      row.sale_price,
      POS_PRICE_LIST,
      row.club_price,
      numeric(row.supplier_code),
      row.supplier_name,
      numeric(row.department_code),
      row.department,
      row.sub_department,
      row.cost,
      row.quantity,
    ]),
  ]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName.replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
  book.Workbook = { Views: [{ RTL: true }] };
  return XLSX.write(book, { bookType: "biff8", type: "buffer" });
}

export type PriceRule = { mode: "multiplier" | "retail"; multiplier: number | null };

/** Selling price is always the club price plus 10%, in whole shekels. */
export const saleFromClub = (club: number) => Math.round(club * 1.1);

/** Suggested prices for a new item; null when the rule lacks what it needs. */
export function suggestPrices(
  rule: PriceRule,
  cost: number | null,
  retail: number | null,
): { club: number; sale: number } | null {
  if (rule.mode === "retail") {
    if (!retail) return null;
    const sale = Math.round(retail);
    return { club: Math.round(sale / 1.1), sale };
  }
  if (!rule.multiplier || !cost) return null;
  const club = Math.round(cost * rule.multiplier);
  return { club, sale: saleFromClub(club) };
}

type DepartmentHint = { id: string; department: string; sub_department: string; item_name: string | null };

const words = (text: string) => text.toLowerCase().split(/[^\p{L}]+/u).filter((word) => word.length >= 3);

/** "טבעת" and "טבעות", "עגיל" and "עגילים": the same word once most of the shorter one is shared. */
function sameWord(a: string, b: string): boolean {
  let shared = 0;
  while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared += 1;
  return shared >= 3 && shared >= Math.min(a.length, b.length) - 1;
}

/**
 * The till department an item most likely belongs to, judged by the words its name
 * shares with the department. Null unless exactly one department fits: a wrong
 * guess that looks filled in is worse than an empty field.
 */
export function suggestDepartment<D extends DepartmentHint>(title: string, departments: D[]): D | null {
  const hints = departments.map((d) => words(`${d.sub_department} ${d.item_name ?? ""} ${d.department}`));
  // A word every department has ("silver") tells them apart from nothing.
  const telling = (word: string, own: number) =>
    departments.length === 1 || hints.some((other, index) => index !== own && !other.some((w) => sameWord(w, word)));
  const titleWords = words(title);
  const scores = hints.map(
    (hint, index) => hint.filter((word) => telling(word, index) && titleWords.some((t) => sameWord(t, word))).length,
  );
  const best = Math.max(0, ...scores);
  if (best === 0 || scores.filter((score) => score === best).length > 1) return null;
  return departments[scores.indexOf(best)];
}
