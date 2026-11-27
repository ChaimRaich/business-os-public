"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { runExtraction } from "@/lib/extraction/run";
import { ensureTillDefaults } from "@/lib/till-defaults";
import {
  DOCUMENT_TYPES,
  DOCUMENTS_BUCKET,
  isAcceptedMimeType,
  MAX_FILE_BYTES,
  MAX_FILES,
  parseAmount,
  type DocumentType,
  type LineInput,
} from "@/lib/documents";
import type { FormState } from "@/components/action-form";

const GENERIC_ERROR = "הפעולה נכשלה. נסו שוב בעוד רגע.";

const RegisterInput = z.object({
  documentId: z.uuid(),
  warehouseId: z.uuid(),
  files: z
    .array(z.object({ path: z.string().min(1).max(300), name: z.string().max(300) }))
    .min(1)
    .max(MAX_FILES),
});

/**
 * Records a document whose files the browser has just uploaded to storage.
 * The files are re-read here: size, type and fingerprint come from the stored
 * object, never from what the browser claims.
 */
export async function registerDocument(input: unknown): Promise<{ error: string }> {
  const { active } = await requireBusiness();
  const parsed = RegisterInput.safeParse(input);
  if (!parsed.success) {
    return { error: "ההעלאה לא הושלמה כראוי. נסו שוב." };
  }
  const { documentId, warehouseId, files } = parsed.data;
  const prefix = `${active.businessId}/${documentId}/`;
  if (files.some((file) => !file.path.startsWith(prefix) || file.path.includes(".."))) {
    return { error: "ההעלאה לא הושלמה כראוי. נסו שוב." };
  }

  const supabase = await createClient();
  const { data: warehouse } = await supabase
    .from("warehouses")
    .select("id")
    .eq("id", warehouseId)
    .eq("business_id", active.businessId)
    .maybeSingle();
  if (!warehouse) {
    return { error: "המחסן שנבחר לא נמצא." };
  }

  const records = [];
  for (const [index, file] of files.entries()) {
    const { data: blob, error } = await supabase.storage.from(DOCUMENTS_BUCKET).download(file.path);
    if (error || !blob) {
      return { error: `הקובץ ${file.name} לא הגיע לשרת. נסו להעלות שוב.` };
    }
    if (!isAcceptedMimeType(blob.type) || blob.size > MAX_FILE_BYTES) {
      return { error: `הקובץ ${file.name} אינו תמונה או PDF נתמך.` };
    }
    const data = Buffer.from(await blob.arrayBuffer());
    records.push({
      business_id: active.businessId,
      document_id: documentId,
      position: index + 1,
      storage_path: file.path,
      original_name: file.name,
      mime_type: blob.type,
      size_bytes: blob.size,
      sha256: createHash("sha256").update(data).digest("hex"),
    });
  }

  const { error: documentError } = await supabase
    .from("documents")
    .insert({ id: documentId, business_id: active.businessId, warehouse_id: warehouseId });
  if (documentError) {
    return { error: GENERIC_ERROR };
  }
  const { error: filesError } = await supabase.from("document_files").insert(records);
  if (filesError) {
    await supabase.from("documents").delete().eq("id", documentId);
    return { error: GENERIC_ERROR };
  }

  revalidatePath("/receiving");
  redirect(`/receiving/${documentId}`);
}

/** Starts (or retries) reading the document. Returns when the reading has finished. */
export async function startExtraction(documentId: string): Promise<void> {
  const { active } = await requireBusiness();
  if (!z.uuid().safeParse(documentId).success) {
    return;
  }
  await runExtraction(documentId, active.businessId);
  revalidatePath(`/receiving/${documentId}`);
  revalidatePath("/receiving");
}

export async function updateDocumentHeader(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const id = String(formData.get("id") ?? "");
  const docType = String(formData.get("doc_type") ?? "");
  const docDate = String(formData.get("doc_date") ?? "");
  if (docDate && !/^\d{4}-\d{2}-\d{2}$/.test(docDate)) {
    return { error: "התאריך אינו תקין." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .update({
      supplier_id: String(formData.get("supplier_id") ?? "") || null,
      doc_type: DOCUMENT_TYPES.includes(docType as DocumentType) ? (docType as DocumentType) : null,
      doc_number: String(formData.get("doc_number") ?? "").trim() || null,
      doc_date: docDate || null,
    })
    .eq("id", id)
    .eq("business_id", active.businessId)
    .eq("status", "review")
    .select("id");
  if (error) {
    return { error: GENERIC_ERROR };
  }
  if (data.length === 0) {
    return { error: "המסמך לא נמצא או שאינו פתוח לעריכה." };
  }
  // Supplier SKUs only match within their supplier, so the choice changes the matches.
  await supabase.rpc("match_document_lines", { p_document_id: id });
  revalidatePath(`/receiving/${id}`);
  revalidatePath("/receiving");
  return { ok: "פרטי המסמך נשמרו." };
}

const supplierDigits = (value: string | null) => (value ?? "").replace(/\D/g, "");

/**
 * One step instead of a detour through the suppliers screen: the supplier printed on
 * the document is added to the list (unless it is already there) and chosen for the document.
 */
export async function addSupplierFromDocument(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const id = String(formData.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) {
    return { error: GENERIC_ERROR };
  }
  const supabase = await createClient();
  const { data: document } = await supabase
    .from("documents")
    .select("id, supplier_name_raw, supplier_tax_id_raw")
    .eq("id", id)
    .eq("business_id", active.businessId)
    .eq("status", "review")
    .maybeSingle();
  if (!document) {
    return { error: "המסמך לא נמצא או שאינו פתוח לעריכה." };
  }
  const name = (document.supplier_name_raw ?? "").trim().slice(0, 120);
  if (!name) {
    return { error: "שם הספק לא נקרא מהמסמך. בחרו ספק מהרשימה או הוסיפו אותו במסך הספקים." };
  }
  const taxId = supplierDigits(document.supplier_tax_id_raw);

  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name, tax_id")
    .eq("business_id", active.businessId);
  let supplierId =
    suppliers?.find(
      (s) => (taxId && supplierDigits(s.tax_id) === taxId) || s.name.trim().toLowerCase() === name.toLowerCase(),
    )?.id ?? null;
  if (!supplierId) {
    const { data: created, error } = await supabase
      .from("suppliers")
      .insert({ business_id: active.businessId, name, tax_id: taxId || null })
      .select("id")
      .single();
    if (error) {
      return { error: GENERIC_ERROR };
    }
    supplierId = created.id;
  }

  const { error: updateError } = await supabase
    .from("documents")
    .update({ supplier_id: supplierId })
    .eq("id", id)
    .eq("business_id", active.businessId)
    .eq("status", "review");
  if (updateError) {
    return { error: GENERIC_ERROR };
  }
  await supabase.rpc("match_document_lines", { p_document_id: id });
  revalidatePath(`/receiving/${id}`);
  revalidatePath("/receiving");
  revalidatePath("/suppliers");
  return null;
}

const FIELD_LABELS = { quantity: "כמות", unit_cost: "עלות", retail_price: "מחיר צרכן" } as const;

/** Saves the whole table as the user sees it, in the order shown. */
export async function saveDocumentLines(
  documentId: string,
  rows: LineInput[],
): Promise<{ error?: string; ok?: string }> {
  const { active } = await requireBusiness();
  if (!z.uuid().safeParse(documentId).success || !Array.isArray(rows) || rows.length > 500) {
    return { error: GENERIC_ERROR };
  }

  const supabase = await createClient();
  const { data: document } = await supabase
    .from("documents")
    .select("id, document_lines (id, unit, discount_pct, line_total, uncertain_fields, note)")
    .eq("id", documentId)
    .eq("business_id", active.businessId)
    .eq("status", "review")
    .maybeSingle();
  if (!document) {
    return { error: "המסמך לא נמצא או שאינו פתוח לעריכה." };
  }
  const stored = new Map(document.document_lines.map((line) => [line.id, line]));

  const lines = [];
  for (const [index, row] of rows.entries()) {
    const numbers: Record<keyof typeof FIELD_LABELS, number | null> = {
      quantity: null,
      unit_cost: null,
      retail_price: null,
    };
    for (const field of Object.keys(FIELD_LABELS) as (keyof typeof FIELD_LABELS)[]) {
      const value = parseAmount(String(row[field] ?? ""));
      if (value === undefined) {
        return { error: `שורה ${index + 1}: הערך בשדה ${FIELD_LABELS[field]} אינו מספר.` };
      }
      numbers[field] = value;
    }
    const kept = typeof row.keep_id === "string" ? stored.get(row.keep_id) : undefined;
    lines.push({
      supplier_sku: String(row.supplier_sku ?? "").slice(0, 64),
      barcode: String(row.barcode ?? "").slice(0, 64),
      description: String(row.description ?? "").slice(0, 500),
      variant_text: String(row.variant_text ?? "").slice(0, 80),
      ...numbers,
      // A row the user did not touch keeps what the document said about it;
      // an edited row is the user's word, so its flags and printed total are dropped.
      ...(kept
        ? {
            unit: kept.unit,
            discount_pct: kept.discount_pct,
            line_total: kept.line_total,
            uncertain_fields: kept.uncertain_fields,
            note: kept.note,
          }
        : {}),
    });
  }

  const { error } = await supabase.rpc("replace_document_lines", {
    p_document_id: documentId,
    p_lines: lines,
  });
  if (error) {
    return { error: GENERIC_ERROR };
  }
  revalidatePath(`/receiving/${documentId}`);
  revalidatePath("/receiving");
  return { ok: "השורות נשמרו." };
}

/** Adds the lines that are not in the catalog yet as products of the document's supplier. */
export async function createMissingProducts(_: FormState, formData: FormData): Promise<FormState> {
  await requireBusiness();
  const id = String(formData.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) {
    return { error: GENERIC_ERROR };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_products_from_lines", { p_document_id: id });
  if (error) {
    if (error.message.includes("supplier_required")) {
      return { error: "קודם בוחרים ספק בפרטי המסמך ושומרים: המוצרים החדשים נרשמים על שמו." };
    }
    if (error.message.includes("not_in_review") || error.message.includes("document_not_found")) {
      return { error: "המסמך לא נמצא או שאינו פתוח לעריכה." };
    }
    if (error.message.includes("variant_codes_unique_code")) {
      return { error: "אחד הברקודים כבר משויך לפריט אחר בקטלוג. בדקו את השורות ונסו שוב." };
    }
    return { error: GENERIC_ERROR };
  }
  revalidatePath(`/receiving/${id}`);
  revalidatePath("/products");
  return {
    ok: data === 0 ? "לא נוספו פריטים חדשים." : data === 1 ? "נוסף פריט אחד לקטלוג." : `נוספו ${data} פריטים לקטלוג.`,
  };
}

const APPROVAL_ERRORS: Record<string, string> = {
  unmatched_lines: "יש שורות שעוד לא קיימות בקטלוג. צריך להוסיף אותן לקטלוג או למחוק אותן לפני האישור.",
  bad_quantity: "יש שורות בלי כמות או עם כמות אפס. השלימו את הכמות שהתקבלה בפועל ושמרו.",
  no_lines: "אין במסמך שורות לקליטה.",
  duplicate_document: "מסמך של אותו ספק עם אותו מספר כבר נקלט למלאי. המלאי לא עודכן שוב.",
  not_in_review: "המסמך אינו פתוח לאישור.",
  document_not_found: "המסמך לא נמצא.",
};

/** Writes the stock movements for the saved lines. Safe to repeat: stock changes once. */
export async function approveDocument(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const id = String(formData.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) {
    return { error: GENERIC_ERROR };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_document", { p_document_id: id });
  if (error) {
    const known = Object.keys(APPROVAL_ERRORS).find((code) => error.message.includes(code));
    // The page may be stale: show what the document looks like now.
    revalidatePath(`/receiving/${id}`);
    return { error: known ? APPROVAL_ERRORS[known] : GENERIC_ERROR };
  }
  // So the till file is ready to make right away, with nothing left to set up.
  await ensureTillDefaults(supabase, active.businessId, id);
  revalidatePath(`/receiving/${id}`);
  revalidatePath("/receiving");
  revalidatePath("/products");
  return null;
}

/** For documents approved before the till details were filled in by themselves. */
export async function fillTillDefaults(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const id = String(formData.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) {
    return { error: GENERIC_ERROR };
  }
  await ensureTillDefaults(await createClient(), active.businessId, id);
  revalidatePath(`/receiving/${id}/export`);
  return null;
}

/** Lets the user type the rows by hand when reading failed. */
export async function openForManualEntry(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .update({ status: "review" })
    .eq("id", id)
    .eq("business_id", active.businessId)
    .eq("status", "failed")
    .select("id");
  if (error || data.length === 0) {
    return { error: GENERIC_ERROR };
  }
  revalidatePath(`/receiving/${id}`);
  revalidatePath("/receiving");
  return null;
}

export async function deleteDocument(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();

  const { data: files } = await supabase
    .from("document_files")
    .select("storage_path")
    .eq("document_id", id)
    .eq("business_id", active.businessId);

  const { data, error } = await supabase
    .from("documents")
    .delete()
    .eq("id", id)
    .eq("business_id", active.businessId)
    .select("id");
  if (error) {
    return {
      error: error.code === "23503" ? "מסמך שנקלט למלאי אי אפשר למחוק." : GENERIC_ERROR,
    };
  }
  if (data.length === 0) {
    return { error: "רק בעלים או מנהל יכולים למחוק מסמך." };
  }
  if (files && files.length > 0) {
    await supabase.storage.from(DOCUMENTS_BUCKET).remove(files.map((file) => file.storage_path));
  }
  revalidatePath("/receiving");
  redirect("/receiving");
}

const EXPORT_ERRORS: Record<string, string> = {
  supplier_required: "למסמך לא נבחר ספק.",
  supplier_pos_missing: "בכרטיס הספק חסרים קוד הספק ושם הספק כפי שהם בקופה.",
  rows_incomplete: "בכל שורה צריך מחלקה, שם פריט, מחיר מועדון ומחיר מכירה.",
  cost_missing: "יש פריט בלי עלות במסמך, והקובץ לקופה דורש עלות בכל שורה.",
  barcode_rule_missing: "בכרטיס הספק לא הוגדר הברקוד הפנימי הבא.",
  barcode_missing: "יש פריט בלי ברקוד ובלי מק״ט של הספק, ואין מה לכתוב בעמודת הברקוד.",
  variant_codes_unique_code: "אחד הברקודים כבר שייך לפריט אחר בקופה. בדקו את הברקוד הבא בכרטיס הספק.",
  not_approved: "קובץ לקופה מכינים רק אחרי אישור הקליטה.",
  document_not_found: "המסמך לא נמצא.",
};

type ExportRowInput = {
  variant_id: string;
  item_name: string;
  department_id: string;
  club_price: string;
  sale_price: string;
};

/** Stores the till file for an approved document. Stock is not touched. */
export async function createPosExport(documentId: string, rows: ExportRowInput[]): Promise<{ error: string } | null> {
  await requireBusiness();
  if (!z.uuid().safeParse(documentId).success || !Array.isArray(rows) || rows.length > 500) {
    return { error: GENERIC_ERROR };
  }
  const payload = [];
  for (const row of rows) {
    const club = parseAmount(String(row.club_price ?? ""));
    const sale = parseAmount(String(row.sale_price ?? ""));
    if (!club || !sale || !z.uuid().safeParse(row.variant_id).success || !z.uuid().safeParse(row.department_id).success) {
      return { error: EXPORT_ERRORS.rows_incomplete };
    }
    payload.push({
      variant_id: row.variant_id,
      item_name: String(row.item_name ?? "").trim().slice(0, 80),
      department_id: row.department_id,
      club_price: club,
      sale_price: sale,
    });
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_pos_export", { p_document_id: documentId, p_rows: payload });
  if (error) {
    const known = Object.keys(EXPORT_ERRORS).find((code) => `${error.message} ${error.details ?? ""}`.includes(code));
    return { error: known ? EXPORT_ERRORS[known] : GENERIC_ERROR };
  }
  revalidatePath(`/receiving/${documentId}/export`);
  revalidatePath(`/receiving/${documentId}`);
  return null;
}

export async function confirmPosExport(_: FormState, formData: FormData): Promise<FormState> {
  await requireBusiness();
  const exportId = String(formData.get("export_id") ?? "");
  const documentId = String(formData.get("document_id") ?? "");
  if (!z.uuid().safeParse(exportId).success || !z.uuid().safeParse(documentId).success) {
    return { error: GENERIC_ERROR };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_pos_export", { p_export_id: exportId });
  if (error) {
    return { error: GENERIC_ERROR };
  }
  revalidateExports(documentId);
  return null;
}

/** The user reports that the till rejected the file, with what it showed. */
export async function reportPosExportProblem(_: FormState, formData: FormData): Promise<FormState> {
  await requireBusiness();
  const exportId = String(formData.get("export_id") ?? "");
  const documentId = String(formData.get("document_id") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!z.uuid().safeParse(exportId).success || !z.uuid().safeParse(documentId).success) {
    return { error: GENERIC_ERROR };
  }
  if (!note) {
    return { error: "כתבו מה הקופה הציגה, כדי שיהיה אפשר לטפל בזה." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("report_pos_export_problem", { p_export_id: exportId, p_note: note });
  if (error) {
    return {
      error: error.message.includes("already_confirmed") ? "הקובץ כבר סומן כנקלט בקופה." : GENERIC_ERROR,
    };
  }
  revalidateExports(documentId);
  return { ok: "התקלה נשמרה." };
}

/** The till status of a file shows on the document, the lists and the history. */
function revalidateExports(documentId: string) {
  revalidatePath(`/receiving/${documentId}/export`);
  revalidatePath(`/receiving/${documentId}`);
  revalidatePath("/receiving");
  revalidatePath("/exports");
}
