import "server-only";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENTS_BUCKET, isAcceptedMimeType } from "@/lib/documents";
import { extractDocument, ExtractionError, type ExtractionFailure, type SourceFile } from "./extract.ts";

// Longest image side sent to the model. Originals are kept untouched in storage.
const MAX_IMAGE_SIDE = 2576;
// A run that has been "extracting" longer than this is assumed dead and may be retried.
const STALE_AFTER_MS = 10 * 60 * 1000;

const FAILURE_MESSAGES: Record<ExtractionFailure, string> = {
  not_configured: "קריאת המסמכים עוד לא הוגדרה: חסר מפתח גישה למודל. פנו למי שמנהל את המערכת.",
  auth: "מפתח הגישה למודל נדחה. צריך לבדוק את ההגדרות.",
  rate_limited: "יש כרגע עומס על שירות הקריאה. נסו שוב בעוד דקה.",
  too_large: "המסמך גדול מדי לקריאה בבת אחת. נסו להעלות פחות עמודים בכל פעם.",
  refused: "המודל לא קרא את המסמך הזה. אפשר להזין את השורות ידנית.",
  truncated: "במסמך יש יותר שורות ממה שאפשר לקרוא בבת אחת. נסו לפצל אותו לכמה העלאות.",
  unavailable: "שירות הקריאה לא זמין כרגע. נסו שוב בעוד כמה דקות.",
  invalid_output: "הקריאה החזירה תוצאה לא תקינה. נסו שוב.",
};

const digits = (value: string | null) => (value ?? "").replace(/\D/g, "");
const normalizeName = (value: string | null) =>
  (value ?? "").toLowerCase().replace(/["'״׳.,\-()]/g, " ").replace(/\s+/g, " ").trim();

async function prepareImage(data: Buffer): Promise<SourceFile> {
  const resized = await sharp(data)
    .rotate() // apply the phone's EXIF orientation
    .resize({ width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
  return { mimeType: "image/jpeg", data: resized };
}

/**
 * Reads a document's files with the model and stores the result for review.
 * Safe to call twice: only one caller claims the document, the other returns at once.
 * Never touches stock.
 */
export async function runExtraction(documentId: string, businessId: string): Promise<void> {
  const supabase = await createClient();

  const staleBefore = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("documents")
    .update({ status: "extracting", extraction_started_at: new Date().toISOString(), extraction_error: null })
    .eq("id", documentId)
    .eq("business_id", businessId)
    .or(`status.in.(uploaded,failed),and(status.eq.extracting,extraction_started_at.lt.${staleBefore})`)
    .select("id");
  if (claimError) {
    throw new Error(`Failed to claim document: ${claimError.message}`);
  }
  if (claimed.length === 0) {
    return;
  }

  const fail = async (message: string) => {
    await supabase
      .from("documents")
      .update({ status: "failed", extraction_error: message })
      .eq("id", documentId);
  };

  try {
    const { data: files, error: filesError } = await supabase
      .from("document_files")
      .select("storage_path, mime_type")
      .eq("document_id", documentId)
      .order("position");
    if (filesError || !files || files.length === 0) {
      throw new Error(`No files for document: ${filesError?.message ?? "empty"}`);
    }

    const sources: SourceFile[] = [];
    for (const file of files) {
      const { data: blob, error } = await supabase.storage.from(DOCUMENTS_BUCKET).download(file.storage_path);
      if (error || !blob) {
        throw new Error(`Failed to download ${file.storage_path}: ${error?.message}`);
      }
      const data = Buffer.from(await blob.arrayBuffer());
      if (file.mime_type === "application/pdf") {
        sources.push({ mimeType: "application/pdf", data });
      } else if (isAcceptedMimeType(file.mime_type)) {
        sources.push(await prepareImage(data));
      }
    }

    const { result, model } = await extractDocument(sources);

    // Supplier: by company number first, then by exact (normalised) name.
    const { data: suppliers } = await supabase
      .from("suppliers")
      .select("id, name, tax_id, pos_name")
      .eq("business_id", businessId);
    const taxId = digits(result.supplier_tax_id);
    const name = normalizeName(result.supplier_name);
    const supplier =
      (taxId && suppliers?.find((s) => digits(s.tax_id) === taxId)) ||
      (name && suppliers?.find((s) => normalizeName(s.name) === name || normalizeName(s.pos_name) === name)) ||
      null;

    const validDate = result.doc_date && /^\d{4}-\d{2}-\d{2}$/.test(result.doc_date) ? result.doc_date : null;

    const { error: headerError } = await supabase
      .from("documents")
      .update({
        supplier_id: supplier ? supplier.id : null,
        doc_type: result.doc_type,
        doc_number: result.doc_number,
        doc_date: validDate,
        supplier_name_raw: result.supplier_name,
        supplier_tax_id_raw: result.supplier_tax_id,
        vat_rate: result.vat_rate,
        printed_subtotal: result.printed_subtotal,
        printed_vat: result.printed_vat,
        printed_total: result.printed_total,
        printed_quantity: result.printed_quantity,
        extraction_notes: result.readable
          ? result.notes
          : (result.notes ?? "לא הצלחנו לקרוא את המסמך. אפשר להעלות צילום ברור יותר או להזין שורות ידנית."),
        extraction_model: model,
        extracted_at: new Date().toISOString(),
      })
      .eq("id", documentId);
    if (headerError) {
      throw new Error(`Failed to save header: ${headerError.message}`);
    }

    const { error: linesError } = await supabase.rpc("replace_document_lines", {
      p_document_id: documentId,
      p_lines: result.lines.map((line) => ({
        supplier_sku: line.supplier_sku,
        barcode: line.barcode,
        description: line.description,
        variant_text: line.variant,
        quantity: line.quantity,
        unit: line.unit,
        unit_cost: line.unit_cost,
        retail_price: line.retail_price,
        discount_pct: line.discount_pct,
        line_total: line.line_total,
        uncertain_fields: line.uncertain_fields,
        note: line.note,
      })),
    });
    if (linesError) {
      throw new Error(`Failed to save lines: ${linesError.message}`);
    }

    await supabase.from("documents").update({ status: "review" }).eq("id", documentId);
  } catch (error) {
    if (error instanceof ExtractionError) {
      console.error(`Extraction failed (${error.reason}) for ${documentId}: ${error.message}`);
      await fail(FAILURE_MESSAGES[error.reason]);
      return;
    }
    console.error(`Extraction crashed for ${documentId}:`, error);
    await fail("הקריאה נכשלה בגלל תקלה. נסו שוב; אם זה חוזר, אפשר להזין את השורות ידנית.");
  }
}
