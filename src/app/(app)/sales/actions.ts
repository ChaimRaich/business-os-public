"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MAX_SALES_ROWS } from "@/lib/sales";
import type { FormState } from "@/components/action-form";

const GENERIC_ERROR = "הפעולה נכשלה. נסו שוב בעוד רגע.";

const ImportInput = z.object({
  warehouseId: z.uuid(),
  fileName: z.string().max(300),
  /** The day the report sums up; required when its rows carry no date. */
  reportDate: z.iso.date().nullable(),
  rows: z
    .array(
      z.object({
        code: z.string().trim().min(1).max(64),
        quantity: z.number().finite().refine((value) => value !== 0),
        item_name: z.string().max(200).nullable(),
        transaction_ref: z.string().max(64).nullable(),
        sold_at: z.iso.datetime().nullable(),
        unit_price: z.number().finite().nonnegative().nullable(),
      }),
    )
    .min(1)
    .max(MAX_SALES_ROWS),
});

const IMPORT_ERRORS: Record<string, string> = {
  already_imported: "הדוח הזה כבר יובא. ייבוא חוזר לא מוריד מלאי שוב.",
  date_already_imported: "כבר יובא דוח מכירות ליום הזה ולמחסן הזה. אם הדוח הקודם היה חלקי, בטלו אותו ברשימת הדוחות וייבאו את המלא.",
  future_date: "תאריך הדוח לא יכול להיות בעתיד.",
  warehouse_not_found: "המחסן שנבחר לא נמצא.",
  no_rows: "לא נמצאו שורות מכירה בדוח.",
  too_many_rows: "הדוח גדול מדי. פצלו אותו לתקופות קצרות יותר.",
  bad_row: "באחת השורות חסר קוד פריט או כמות.",
};

/** Brings in a till sales report the browser has read. Lowers stock once per sale. */
export async function importSales(input: unknown): Promise<{ error: string }> {
  await requireBusiness();
  const parsed = ImportInput.safeParse(input);
  if (!parsed.success) {
    return { error: "הדוח לא נקרא כראוי. בדקו את בחירת העמודות ונסו שוב." };
  }
  const { warehouseId, fileName, reportDate, rows } = parsed.data;
  if (!reportDate && rows.some((row) => !row.sold_at)) {
    return { error: "בדוח אין תאריך לכל שורה. בחרו את היום שהדוח מסכם." };
  }
  // Of the rows, not of the file: the till stamps the export time into the file,
  // so the same report exported twice would not be the same file.
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([warehouseId, reportDate, rows.map((row) => [row.code.toUpperCase(), row.quantity, row.transaction_ref, row.sold_at])]))
    .digest("hex");

  const supabase = await createClient();
  const { error } = await supabase.rpc("import_sales", {
    p_warehouse_id: warehouseId,
    p_file_name: fileName,
    p_fingerprint: fingerprint,
    p_rows: rows,
    p_report_date: reportDate ?? undefined,
  });
  if (error) {
    const known = Object.keys(IMPORT_ERRORS).find((code) => error.message.includes(code));
    return { error: known ? IMPORT_ERRORS[known] : GENERIC_ERROR };
  }
  revalidateSales();
  redirect("/sales");
}

/** Tries again to find the catalog item of the sales that had none. */
export async function rematchSales(): Promise<FormState> {
  const { active } = await requireBusiness();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rematch_sales_lines", { p_business_id: active.businessId });
  if (error) {
    return { error: GENERIC_ERROR };
  }
  revalidateSales();
  return {
    ok: data === 0 ? "לא נמצאו התאמות חדשות. הקודים עדיין לא קיימים בקטלוג." : `${data} שורות מכירה זוהו והמלאי עודכן.`,
  };
}

/** "Not a stock item": the code is dropped now and skipped in every later report. */
export async function ignoreSalesCode(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const code = String(formData.get("code") ?? "").trim();
  const supabase = await createClient();
  const { error } = await supabase.rpc("ignore_sales_code", { p_business_id: active.businessId, p_code: code });
  if (error) {
    return { error: GENERIC_ERROR };
  }
  revalidateSales();
  return null;
}

export async function unignoreSalesCode(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const code = String(formData.get("code") ?? "").trim();
  const supabase = await createClient();
  const { error } = await supabase.rpc("unignore_sales_code", { p_business_id: active.businessId, p_code: code });
  if (error) {
    return { error: GENERIC_ERROR };
  }
  revalidateSales();
  return null;
}

/** Cancels an import and puts its stock back, so a corrected report can be imported. */
export async function revertSalesImport(_: FormState, formData: FormData): Promise<FormState> {
  await requireBusiness();
  const id = String(formData.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) {
    return { error: GENERIC_ERROR };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("revert_sales_import", { p_import_id: id });
  if (error) {
    return { error: error.code === "42501" ? "רק בעלים או מנהל יכולים לבטל ייבוא." : GENERIC_ERROR };
  }
  revalidateSales();
  return null;
}

function revalidateSales() {
  revalidatePath("/sales");
  revalidatePath("/settings/connections");
  revalidatePath("/products");
}
