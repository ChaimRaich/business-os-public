"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { catalogErrorMessage } from "@/lib/catalog";

export type VariantChoice = { variantId: string; title: string; supplier: string | null };

/** Catalog items for the "link to an existing product" picker. */
export async function searchVariants(query: string): Promise<VariantChoice[]> {
  const { active } = await requireBusiness();
  const text = String(query ?? "").trim().slice(0, 80);
  if (text.length < 2) {
    return [];
  }
  const supabase = await createClient();
  const { data } = await supabase
    .rpc("search_products", { p_business_id: active.businessId, p_query: text })
    .select("id, name, suppliers (name), product_variants (id, label)")
    .limit(8);
  return (data ?? []).flatMap((product) =>
    product.product_variants.map((variant) => ({
      variantId: variant.id,
      title: [product.name, variant.label].filter(Boolean).join(" · "),
      supplier: product.suppliers?.name ?? null,
    })),
  );
}

/**
 * Links a document line to an existing catalog item by teaching the catalog the
 * line's code: its barcode, or else the supplier's SKU. The same item is then
 * recognised on every later document too.
 */
export async function linkLineToVariant(
  documentId: string,
  lineId: string,
  variantId: string,
): Promise<{ error?: string; ok?: string }> {
  const { active } = await requireBusiness();
  if (![documentId, lineId, variantId].every((id) => z.uuid().safeParse(id).success)) {
    return { error: "הפעולה נכשלה. נסו שוב בעוד רגע." };
  }
  const supabase = await createClient();
  const { data: line } = await supabase
    .from("document_lines")
    .select("id, barcode, supplier_sku, documents!inner (id, status, supplier_id)")
    .eq("id", lineId)
    .eq("document_id", documentId)
    .eq("business_id", active.businessId)
    .maybeSingle();
  if (!line || line.documents.status !== "review") {
    return { error: "המסמך לא נמצא או שאינו פתוח לעריכה." };
  }
  const barcode = line.barcode?.trim();
  const sku = line.supplier_sku?.trim();
  if (!barcode && !sku) {
    return { error: "בשורה אין ברקוד ואין מק״ט ספק, ואין לפי מה לזהות אותה בעתיד. הוסיפו מק״ט לשורה, שמרו, ונסו שוב." };
  }
  if (!barcode && !line.documents.supplier_id) {
    return { error: "בחרו קודם את הספק של המסמך: מק״ט ספק נשמר יחד עם הספק שלו." };
  }

  const { error } = await supabase.from("variant_codes").insert(
    barcode
      ? { business_id: active.businessId, variant_id: variantId, kind: "barcode", code: barcode }
      : { business_id: active.businessId, variant_id: variantId, kind: "supplier_sku", supplier_id: line.documents.supplier_id, code: sku! },
  );
  // The code may already be on this item (the SKU of a model shared by its sizes).
  if (error && !`${error.message} ${error.details ?? ""}`.includes("variant_codes_supplier_sku_key")) {
    return { error: catalogErrorMessage(error) };
  }

  await supabase.rpc("match_document_lines", { p_document_id: documentId });
  const { data: after } = await supabase.from("document_lines").select("variant_id").eq("id", lineId).maybeSingle();
  revalidatePath(`/receiving/${documentId}`);
  revalidatePath("/products");
  if (after?.variant_id !== variantId) {
    return {
      error: "המק״ט נוסף לפריט, אבל הוא משותף לכמה וריאציות של אותו דגם ולכן השורה עדיין לא מזוהה. הוסיפו לשורה ברקוד, או כתבו בעמודת הווריאציה את שם הווריאציה כפי שהוא בקטלוג.",
    };
  }
  return { ok: "השורה שויכה." };
}
