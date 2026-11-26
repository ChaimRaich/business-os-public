import type { Database } from "@/lib/database.types";
import { catalogErrorMessage } from "@/lib/catalog";

export type MovementKind = Database["public"]["Enums"]["movement_kind"];

export const MOVEMENT_KIND_LABELS: Record<MovementKind, string> = {
  receipt: "קליטת סחורה",
  adjustment: "התאמת מלאי",
};

const MESSAGES: Record<string, string> = {
  missing_supplier: "צריך לבחור ספק בפרטי המסמך.",
  no_lines: "אין שורות לאישור.",
  incomplete_lines: "לכל שורה צריך מוצר וכמות גדולה מאפס.",
  not_in_review: "המסמך אינו במצב שאפשר לאשר.",
  document_locked: "הקליטה כבר אושרה ונעולה לעריכה. לתיקון משתמשים בהתאמת מלאי.",
  line_already_linked: "השורה כבר משויכת למוצר.",
  line_not_found: "השורה לא נמצאה. רעננו את העמוד ונסו שוב.",
  negative_stock: "אי אפשר להוריד יותר ממה שיש במלאי במחסן הזה.",
  barcode_sequence_full: "הרצף של הברקודים הפנימיים לספק הזה מלא.",
  stock_movements_adjustment_has_reason: "חובה לכתוב סיבה להתאמה.",
};

/** Turns a database error from stock, approval or export into a message the user can act on. */
export function stockErrorMessage(error: { code?: string; message: string; details?: string | null }): string {
  const known = Object.keys(MESSAGES).find((key) => error.message.includes(key));
  return known ? MESSAGES[known] : catalogErrorMessage(error);
}

const quantityFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });
export const formatQuantity = (value: number) => quantityFormat.format(value);

const dateTimeFormat = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Jerusalem",
});
export const formatDateTime = (value: string) => dateTimeFormat.format(new Date(value));

export const itemTitle = (productName: string, variantLabel: string) =>
  variantLabel ? `${productName} · ${variantLabel}` : productName;
