"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { runExtraction } from "@/lib/extraction/run";
import { loadExportData } from "@/lib/export-data";
import { buildPosWorkbook, planExport, sheetName, TEMPLATE_VERSION } from "@/lib/pos-export";
import { asMaterial, asProductType } from "@/lib/pricing";
import { stockErrorMessage } from "@/lib/stock";
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

const FIELD_LABELS = {
  quantity: "כמות",
  unit_cost: "עלות",
  retail_price: "מחיר צרכן",
  sale_price: "מחיר מכירה",
  club_price: "מחיר מועדון",
} as const;

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
      sale_price: null,
      club_price: null,
    };
    for (const field of Object.keys(FIELD_LABELS) as (keyof typeof FIELD_LABELS)[]) {
      const value = parseAmount(String(row[field] ?? ""));
      if (value === undefined) {
        return { error: `שורה ${index + 1}: הערך בשדה ${FIELD_LABELS[field]} אינו מספר.` };
      }
      if (value === 0 && (field === "sale_price" || field === "club_price")) {
        return { error: `שורה ${index + 1}: ${FIELD_LABELS[field]} חייב להיות גדול מאפס, או ריק לחישוב אוטומטי.` };
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
      product_type: asProductType(row.product_type),
      material: asMaterial(row.material),
      manual_variant_id: z.uuid().safeParse(row.manual_variant_id).success ? row.manual_variant_id : null,
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
    return { error: GENERIC_ERROR };
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

// --- Linking lines to the catalog ---------------------------------------------

type Result = { error?: string; ok?: string };

/** The document of a line, only if the line belongs to the active business. */
async function ownLine(lineId: string, businessId: string) {
  if (!z.uuid().safeParse(lineId).success) {
    return null;
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("document_lines")
    .select("document_id")
    .eq("id", lineId)
    .eq("business_id", businessId)
    .maybeSingle();
  return data ? { supabase, documentId: data.document_id } : null;
}

export type CatalogHit = { variantId: string; productName: string; variantLabel: string; codes: string[] };

export async function searchCatalog(query: string): Promise<CatalogHit[]> {
  const { active } = await requireBusiness();
  const term = String(query ?? "").trim().slice(0, 100);
  if (!term) {
    return [];
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("search_products", { p_business_id: active.businessId, p_query: term })
    .select("id, name, product_variants (id, label, variant_codes (code))")
    .limit(10);
  if (error) {
    throw new Error(`Catalog search failed: ${error.message}`);
  }
  return data.flatMap((product) =>
    product.product_variants.map((variant) => ({
      variantId: variant.id,
      productName: product.name,
      variantLabel: variant.label,
      codes: variant.variant_codes.map((c) => c.code),
    })),
  );
}

/** Links a line to an existing item; a null variant removes a manual link. */
export async function linkLine(lineId: string, variantId: string | null): Promise<Result> {
  const { active } = await requireBusiness();
  const line = await ownLine(lineId, active.businessId);
  if (!line || (variantId !== null && !z.uuid().safeParse(variantId).success)) {
    return { error: GENERIC_ERROR };
  }
  const { error } = await line.supabase.rpc("link_document_line", {
    p_line_id: lineId,
    p_variant_id: variantId,
  });
  if (error) {
    return { error: stockErrorMessage(error) };
  }
  revalidatePath(`/receiving/${line.documentId}`);
  return {};
}

const NewItem = z.object({
  lineId: z.uuid(),
  productId: z.uuid().nullable(),
  name: z.string().trim().max(200),
  label: z.string().trim().max(80),
  productType: z.string(),
  material: z.string(),
});

export async function createItemForLine(input: unknown): Promise<Result> {
  const { active } = await requireBusiness();
  const parsed = NewItem.safeParse(input);
  if (!parsed.success) {
    return { error: GENERIC_ERROR };
  }
  const item = parsed.data;
  if (!item.productId && !item.name) {
    return { error: "יש להזין שם מוצר." };
  }
  const line = await ownLine(item.lineId, active.businessId);
  if (!line) {
    return { error: GENERIC_ERROR };
  }
  const { error } = await line.supabase.rpc("create_item_for_line", {
    p_line_id: item.lineId,
    p_product_id: item.productId,
    p_name: item.name,
    p_label: item.label,
    p_product_type: asProductType(item.productType) ?? undefined,
    p_material: asMaterial(item.material) ?? undefined,
  });
  if (error) {
    return { error: stockErrorMessage(error) };
  }
  revalidatePath(`/receiving/${line.documentId}`);
  revalidatePath("/products");
  return { ok: "המוצר נוצר ושויך לשורה." };
}

// --- Approval and POS export ----------------------------------------------------

async function ownDocument(documentId: string, businessId: string) {
  if (!z.uuid().safeParse(documentId).success) {
    return null;
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("documents")
    .select("id")
    .eq("id", documentId)
    .eq("business_id", businessId)
    .maybeSingle();
  return data ? supabase : null;
}

export async function approveDocument(documentId: string): Promise<Result> {
  const { active } = await requireBusiness();
  const supabase = await ownDocument(documentId, active.businessId);
  if (!supabase) {
    return { error: GENERIC_ERROR };
  }
  // The database does the whole thing once; approving again changes nothing.
  const { error } = await supabase.rpc("approve_document", { p_document_id: documentId });
  if (error) {
    return { error: stockErrorMessage(error) };
  }
  revalidatePath(`/receiving/${documentId}`);
  revalidatePath("/receiving");
  revalidatePath("/products", "layout");
  return { ok: "הקליטה אושרה והמלאי עודכן." };
}

export async function fillLineCost(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const lineId = String(formData.get("line_id") ?? "");
  const cost = parseAmount(String(formData.get("unit_cost") ?? ""));
  if (!cost) {
    return { error: "יש להזין עלות גדולה מאפס." };
  }
  const line = await ownLine(lineId, active.businessId);
  if (!line) {
    return { error: GENERIC_ERROR };
  }
  const { error } = await line.supabase.rpc("fill_line_cost", { p_line_id: lineId, p_cost: cost });
  if (error) {
    return { error: stockErrorMessage(error) };
  }
  revalidatePath(`/receiving/${line.documentId}`);
  return { ok: "העלות נשמרה." };
}

/** Creates the POS file once. Never touches stock. */
export async function createPosExport(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const documentId = String(formData.get("id") ?? "");
  const supabase = await ownDocument(documentId, active.businessId);
  if (!supabase) {
    return { error: GENERIC_ERROR };
  }
  const { error: barcodeError } = await supabase.rpc("assign_internal_barcodes", { p_document_id: documentId });
  if (barcodeError) {
    return { error: stockErrorMessage(barcodeError) };
  }

  const data = await loadExportData(supabase, active.businessId, documentId);
  if (!data || data.status !== "approved") {
    return { error: "אפשר ליצור קובץ רק לקליטה מאושרת." };
  }
  if (data.existingInPos.length > 0 && formData.get("confirm_existing") !== "on") {
    return { error: "יש בקובץ פריטים שאולי כבר קיימים בקופה. סמנו את תיבת האישור כדי להמשיך." };
  }
  const plan = planExport(data.input);
  if (plan.problems.length > 0) {
    revalidatePath(`/receiving/${documentId}`);
    return { error: "חסרים פרטים. הרשימה המלאה מופיעה למעלה." };
  }

  const file = buildPosWorkbook(plan.rows, sheetName(data.input.supplier.posName!));
  const baseName = `pos-${data.input.supplier.posName}-${data.docNumber ?? documentId.slice(0, 8)}`;
  const { error } = await supabase.from("pos_exports").insert({
    business_id: active.businessId,
    document_id: documentId,
    file_name: `${baseName.replace(/[\\/:*?"<>|\s]+/g, "-")}.xls`,
    template_version: TEMPLATE_VERSION,
    row_count: plan.rows.length,
    variant_ids: plan.variantIds,
    content_base64: file.toString("base64"),
  });
  // 23505: a parallel click created it first; that file is the one.
  if (error && error.code !== "23505") {
    return { error: stockErrorMessage(error) };
  }
  revalidatePath(`/receiving/${documentId}`);
  return { ok: "הקובץ מוכן להורדה." };
}

export async function markExportUploaded(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const documentId = String(formData.get("id") ?? "");
  const supabase = await ownDocument(documentId, active.businessId);
  if (!supabase) {
    return { error: GENERIC_ERROR };
  }
  if (formData.get("confirm") !== "on") {
    return { error: "סמנו שהקובץ נקלט בקופה." };
  }
  const { data: record } = await supabase
    .from("pos_exports")
    .select("id")
    .eq("document_id", documentId)
    .maybeSingle();
  if (!record) {
    return { error: GENERIC_ERROR };
  }
  const { error } = await supabase.rpc("mark_export_uploaded", { p_export_id: record.id });
  if (error) {
    return { error: stockErrorMessage(error) };
  }
  revalidatePath(`/receiving/${documentId}`);
  return { ok: "סומן כהועלה לקופה." };
}
