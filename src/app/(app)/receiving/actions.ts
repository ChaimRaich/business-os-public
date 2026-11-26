"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { runExtraction } from "@/lib/extraction/run";
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
