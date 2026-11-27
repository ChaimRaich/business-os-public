import type { Database } from "@/lib/database.types";

export type DocumentStatus = Database["public"]["Enums"]["document_status"];
export type DocumentType = Database["public"]["Enums"]["document_type"];

export const DOCUMENTS_BUCKET = "documents";
export const MAX_FILES = 10;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const ACCEPTED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type AcceptedMimeType = (typeof ACCEPTED_MIME_TYPES)[number];

export function isAcceptedMimeType(value: string): value is AcceptedMimeType {
  return (ACCEPTED_MIME_TYPES as readonly string[]).includes(value);
}

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  uploaded: "ממתין לקריאה",
  extracting: "בקריאה",
  review: "ממתין לבדיקה",
  failed: "הקריאה נכשלה",
  approved: "נקלט למלאי",
};

export const DOCUMENT_TYPES: DocumentType[] = ["delivery_note", "tax_invoice", "tax_invoice_receipt", "other"];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  delivery_note: "תעודת משלוח",
  tax_invoice: "חשבונית מס",
  tax_invoice_receipt: "חשבונית מס / קבלה",
  other: "אחר",
};

/** Editable line as the review screen sends it. Numbers travel as strings exactly as typed. */
export type LineInput = {
  supplier_sku: string;
  barcode: string;
  description: string;
  variant_text: string;
  quantity: string;
  unit_cost: string;
  retail_price: string;
  /** Id of the stored line this row is an untouched copy of; its flags, note and printed total are kept. */
  keep_id: string | null;
};

/** "1,200.50" -> 1200.5; "" -> null; anything else that is not a number -> undefined. */
export function parseAmount(raw: string): number | null | undefined {
  const cleaned = raw.replace(/[\s,₪]/g, "");
  if (cleaned === "") {
    return null;
  }
  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    return undefined;
  }
  return Number(cleaned);
}

export function formatAmount(value: number | null, digits = 2): string {
  return value === null
    ? ""
    : value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** What happened to a till file after it was produced. Producing it is not a sync. */
export type ExportState = "pending" | "problem" | "confirmed";
/** The same for a whole receipt, which may have several files or none. */
export type TillState = ExportState | "none";

type ExportMarks = { confirmed_at: string | null; problem_at: string | null; created_at: string };

export function exportState(item: Omit<ExportMarks, "created_at">): ExportState {
  return item.confirmed_at ? "confirmed" : item.problem_at ? "problem" : "pending";
}

/** A receipt is in the till once any of its files was accepted; otherwise its newest file decides. */
export function tillState(exports: ExportMarks[]): TillState {
  if (exports.length === 0) return "none";
  if (exports.some((item) => item.confirmed_at)) return "confirmed";
  const newest = exports.reduce((a, b) => (a.created_at > b.created_at ? a : b));
  return exportState(newest);
}

export const TILL_STATE_LABELS: Record<TillState, string> = {
  none: "לא הוכן קובץ לקופה",
  pending: "ממתין להעלאה לקופה",
  problem: "תקלה בקופה",
  confirmed: "נקלט בקופה",
};

export const TILL_STATE_STYLES: Record<TillState, string> = {
  none: "bg-canvas text-muted",
  pending: "bg-warn-soft text-warn",
  problem: "bg-danger-soft text-danger",
  confirmed: "bg-accent-soft text-accent-strong",
};
