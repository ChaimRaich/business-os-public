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
