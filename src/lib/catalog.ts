import type { Database } from "@/lib/database.types";

export type CodeKind = Database["public"]["Enums"]["code_kind"];

export const CODE_KINDS: CodeKind[] = ["barcode", "supplier_sku", "pos", "web"];

export const CODE_KIND_LABELS: Record<CodeKind, string> = {
  barcode: "ברקוד",
  supplier_sku: "מק״ט ספק",
  pos: "מק״ט קופה",
  web: "מזהה באתר",
};

export function isCodeKind(value: unknown): value is CodeKind {
  return CODE_KINDS.includes(value as CodeKind);
}

type DbError = { code?: string; message: string; details?: string | null };

/** Turns a Postgres error from a catalog write into a message the user can act on. */
export function catalogErrorMessage(error: DbError): string {
  const text = `${error.message} ${error.details ?? ""}`;

  if (text.includes("variant_codes_unique_code")) {
    return "אחד הקודים כבר משויך לפריט אחר בקטלוג.";
  }
  if (text.includes("variant_codes_single_pos_web")) {
    return "לווריאציה כבר יש קוד מהסוג הזה. מחקו את הקיים לפני שמוסיפים חדש.";
  }
  if (text.includes("variant_codes_supplier_sku_key")) {
    return "מק״ט הספק הזה כבר רשום לווריאציה.";
  }
  if (text.includes("variant_codes_supplier_matches_kind")) {
    return "למק״ט ספק חובה לבחור ספק.";
  }
  if (text.includes("product_variants_label_key")) {
    return "יש כבר וריאציה בשם הזה במוצר. לכל וריאציה צריך שם שונה.";
  }
  if (text.includes("document_locked") || (error.code === "23503" && /stock_(movements|balances)/.test(text))) {
    return "אי אפשר למחוק: לפריט יש תנועות מלאי או שהוא מופיע בקליטה מאושרת.";
  }
  if (text.includes("last_variant")) {
    return "למוצר חייבת להישאר לפחות וריאציה אחת.";
  }
  if (text.includes("suppliers_name_key")) {
    return "כבר קיים ספק בשם הזה.";
  }
  if (text.includes("warehouses_name_key")) {
    return "כבר קיים מחסן בשם הזה.";
  }
  if (error.code === "23503") {
    return "אי אפשר למחוק: יש רשומות אחרות שתלויות בזה.";
  }
  if (error.code === "23514" || error.code === "22001") {
    return "אחד השדות ריק או ארוך מדי.";
  }
  if (error.code === "42501") {
    return "אין לכם הרשאה לפעולה הזו.";
  }
  return "הפעולה נכשלה. נסו שוב בעוד רגע.";
}

export function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export function optional(formData: FormData, key: string): string | null {
  return text(formData, key) || null;
}

/** "ברקוד 0123 כבר משויך לפריט אחר בקטלוג." */
export function takenCodeMessage(codes: { kind: CodeKind; code: string }[]): string {
  const list = codes.map((c) => `${CODE_KIND_LABELS[c.kind]} ${c.code}`).join(", ");
  return codes.length === 1
    ? `${list} כבר משויך לפריט אחר בקטלוג.`
    : `הקודים האלה כבר משויכים לפריטים אחרים בקטלוג: ${list}.`;
}
