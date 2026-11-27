import * as XLSX from "xlsx";
import type { createClient } from "@/lib/supabase/server";
import { DOCUMENT_TYPE_LABELS, type DocumentType } from "@/lib/documents";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const EXPENSE_CATEGORIES = ["rent", "utilities", "salaries", "marketing", "services", "equipment", "taxes", "other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  rent: "שכירות",
  utilities: "חשמל, מים ותקשורת",
  salaries: "שכר",
  marketing: "שיווק ופרסום",
  services: "שירותים מקצועיים",
  equipment: "ציוד",
  taxes: "מיסים ואגרות",
  other: "אחר",
};

export function isExpenseCategory(value: string): value is ExpenseCategory {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Periods. VAT is reported per month or per two months, so both are offered.
// ---------------------------------------------------------------------------

/** Inclusive ISO dates. */
export type Period = { key: string; label: string; from: string; to: string };

const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const pad = (value: number) => String(value).padStart(2, "0");

export function todayInIsrael(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
}

export const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

/** "2026-11-27" -> "27/11/2026" */
export const formatDay = (iso: string) => iso.split("-").reverse().join("/");

function makePeriod(year: number, month: number, months: 1 | 2): Period {
  const last = month + months - 1;
  const lastDay = new Date(Date.UTC(year, last, 0)).getUTCDate();
  return {
    key: `${year}-${pad(month)}${months === 2 ? "-2" : ""}`,
    label: months === 2 ? `${MONTHS[month - 1]}–${MONTHS[last - 1]} ${year}` : `${MONTHS[month - 1]} ${year}`,
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(last)}-${pad(lastDay)}`,
  };
}

/** The period a key names; the current two-month period when the key is missing or malformed. */
export function parsePeriod(key: string | undefined, today: string): Period {
  const match = key?.match(/^(\d{4})-(\d{2})(-2)?$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const double = Boolean(match[3]);
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12 && (!double || month % 2 === 1)) {
      return makePeriod(year, month, double ? 2 : 1);
    }
  }
  const [year, month] = today.split("-").map(Number);
  return makePeriod(year, month % 2 === 1 ? month : month - 1, 2);
}

/** The last six two-month periods and the last twelve months, newest first. */
export function periodOptions(today: string): { double: Period[]; single: Period[] } {
  const [year, month] = today.split("-").map(Number);
  const back = (start: number, step: number, count: number, months: 1 | 2) =>
    Array.from({ length: count }, (_, index) => {
      const zeroBased = start - 1 - index * step;
      return makePeriod(year + Math.floor(zeroBased / 12), (((zeroBased % 12) + 12) % 12) + 1, months);
    });
  return { double: back(month % 2 === 1 ? month : month - 1, 2, 6, 2), single: back(month, 1, 12, 1) };
}

export const inPeriod = (date: string, period: Period) => date >= period.from && date <= period.to;

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export type Purchase = {
  documentId: string;
  supplierName: string | null;
  docType: DocumentType | null;
  docNumber: string | null;
  date: string;
  /** Before VAT. */
  net: number;
  /** VAT that can be claimed; null when the document states neither VAT nor a rate. */
  vat: number | null;
  total: number;
  /** A delivery note is not a tax document: its VAT is not counted. */
  isTaxDocument: boolean;
  linesWithoutCost: number;
  dueDate: string | null;
  paidAt: string | null;
};

export type Expense = {
  id: string;
  date: string;
  vendor: string;
  category: ExpenseCategory;
  description: string | null;
  docNumber: string | null;
  net: number;
  vat: number;
  total: number;
  dueDate: string | null;
  paidAt: string | null;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Everything the accounting screens show. Only owner / manager get rows back for money tables. */
export async function loadAccounting(supabase: Supabase, businessId: string): Promise<{ purchases: Purchase[]; expenses: Expense[] }> {
  const [purchases, payments, expenses] = await Promise.all([
    supabase
      .from("accounting_purchases")
      .select("document_id, supplier_name, doc_type, doc_number, doc_date, vat_rate, printed_subtotal, printed_vat, printed_total, lines_net, lines_without_cost")
      .eq("business_id", businessId)
      .order("doc_date", { ascending: false })
      .limit(1000),
    supabase.from("document_payments").select("document_id, due_date, paid_at").eq("business_id", businessId).limit(1000),
    supabase
      .from("expenses")
      .select("id, expense_date, vendor, category, description, doc_number, amount_net, vat_amount, due_date, paid_at")
      .eq("business_id", businessId)
      .order("expense_date", { ascending: false })
      .limit(1000),
  ]);
  const failed = purchases.error ?? payments.error ?? expenses.error;
  if (failed) {
    throw new Error(`Failed to load accounting: ${failed.message}`);
  }

  const paymentOf = new Map((payments.data ?? []).map((row) => [row.document_id, row]));
  return {
    purchases: (purchases.data ?? []).flatMap((row) => {
      if (!row.document_id || !row.doc_date) return [];
      const isTaxDocument = row.doc_type === "tax_invoice" || row.doc_type === "tax_invoice_receipt";
      const net = row.printed_subtotal ?? row.lines_net ?? 0;
      const vat = !isTaxDocument ? 0 : (row.printed_vat ?? (row.vat_rate === null ? null : round2((net * row.vat_rate) / 100)));
      const payment = paymentOf.get(row.document_id);
      return [{
        documentId: row.document_id,
        supplierName: row.supplier_name,
        docType: row.doc_type,
        docNumber: row.doc_number,
        date: row.doc_date,
        net,
        vat,
        total: row.printed_total ?? round2(net + (vat ?? 0)),
        isTaxDocument,
        linesWithoutCost: row.lines_without_cost ?? 0,
        dueDate: payment?.due_date ?? null,
        paidAt: payment?.paid_at ?? null,
      }];
    }),
    expenses: (expenses.data ?? []).map((row) => ({
      id: row.id,
      date: row.expense_date,
      vendor: row.vendor,
      category: isExpenseCategory(row.category) ? row.category : "other",
      description: row.description,
      docNumber: row.doc_number,
      net: row.amount_net,
      vat: row.vat_amount,
      total: round2(row.amount_net + row.vat_amount),
      dueDate: row.due_date,
      paidAt: row.paid_at,
    })),
  };
}

export function summarize(purchases: Purchase[], expenses: Expense[]) {
  const sum = (values: number[]) => round2(values.reduce((total, value) => total + value, 0));
  return {
    purchasesNet: sum(purchases.map((item) => item.net)),
    expensesNet: sum(expenses.map((item) => item.net)),
    inputVat: sum([...purchases.map((item) => item.vat ?? 0), ...expenses.map((item) => item.vat)]),
    total: sum([...purchases.map((item) => item.total), ...expenses.map((item) => item.total)]),
    /** Tax documents whose VAT is unknown, so the VAT figure is short by them. */
    vatUnknown: purchases.filter((item) => item.vat === null).length,
  };
}

/** What is still owed, over all time. */
export function openPayables(purchases: Purchase[], expenses: Expense[], today: string) {
  const open = [...purchases, ...expenses].filter((item) => item.paidAt === null);
  return {
    count: open.length,
    total: round2(open.reduce((total, item) => total + item.total, 0)),
    overdue: open.filter((item) => item.dueDate !== null && item.dueDate < today).length,
  };
}

/** Why the document's VAT is not in the total, when it is not. */
export const vatNote = (item: Purchase) =>
  item.docType === null
    ? "סוג המסמך לא צוין, המע״מ לא נספר"
    : !item.isTaxDocument
      ? "לא מסמך מס, המע״מ לא נספר"
      : item.vat === null
        ? "המע״מ לא מופיע במסמך"
        : null;

export const purchaseTitle = (item: Purchase) =>
  `${item.docType ? DOCUMENT_TYPE_LABELS[item.docType] : "מסמך"}${item.docNumber ? ` ${item.docNumber}` : ""}`;

/** The period as a workbook for the accountant: a summary, supplier documents, other expenses. */
export function buildAccountantWorkbook(period: Period, purchases: Purchase[], expenses: Expense[]): Buffer {
  const totals = summarize(purchases, expenses);
  const paid = (value: string | null) => (value ? formatDay(value) : "לא שולם");
  const book = XLSX.utils.book_new();
  const add = (name: string, rows: (string | number | null)[][]) =>
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);

  add("סיכום", [
    ["תקופה", period.label],
    ["מתאריך", formatDay(period.from)],
    ["עד תאריך", formatDay(period.to)],
    [],
    ['קניות סחורה לפני מע"מ', totals.purchasesNet],
    ['הוצאות אחרות לפני מע"מ', totals.expensesNet],
    ['מע"מ תשומות', totals.inputVat],
    ['סך הכול כולל מע"מ', totals.total],
    ...(totals.vatUnknown > 0 ? [['מסמכים שהמע"מ שלהם לא ידוע', totals.vatUnknown]] : []),
  ]);
  add("מסמכי ספקים", [
    ["תאריך", "ספק", "סוג מסמך", "מספר מסמך", 'לפני מע"מ', 'מע"מ', 'סה"כ', "שולם", "הערה"],
    ...purchases.map((item) => [
      formatDay(item.date),
      item.supplierName ?? "",
      item.docType ? DOCUMENT_TYPE_LABELS[item.docType] : "",
      item.docNumber ?? "",
      item.net,
      item.vat,
      item.total,
      paid(item.paidAt),
      [
        vatNote(item),
        item.linesWithoutCost > 0 && `${item.linesWithoutCost} שורות בלי עלות`,
      ].filter(Boolean).join("; "),
    ]),
  ]);
  add("הוצאות אחרות", [
    ["תאריך", "ספק / נותן שירות", "סוג", "תיאור", "מספר מסמך", 'לפני מע"מ', 'מע"מ', 'סה"כ', "שולם"],
    ...expenses.map((item) => [
      formatDay(item.date),
      item.vendor,
      EXPENSE_CATEGORY_LABELS[item.category],
      item.description ?? "",
      item.docNumber ?? "",
      item.net,
      item.vat,
      item.total,
      paid(item.paidAt),
    ]),
  ]);
  book.Workbook = { Views: [{ RTL: true }, { RTL: true }, { RTL: true }] };
  return XLSX.write(book, { bookType: "xlsx", type: "buffer" });
}
