import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/** The department every item goes to until the shop defines its own. */
export const DEFAULT_DEPARTMENT = { code: "1", department: "תכשיטי כסף", sub_department: "תכשיטי כסף" };
/** The shop's usual markup (SPEC 13.4): club price = cost x 2.9. */
const DEFAULT_MULTIPLIER = 2.9;

/**
 * Fills in whatever the till file needs and nobody entered, so that an approved
 * document always has a file to download: the supplier of the document becomes the
 * supplier in the till (its own name, the next free code), barcodes are the supplier's
 * when it prints them and a running internal number otherwise, and a shop without
 * departments gets one. Never replaces a value that is already there.
 */
export async function ensureTillDefaults(supabase: SupabaseClient<Database>, businessId: string, documentId: string) {
  const { data: document } = await supabase
    .from("documents")
    .select(
      `suppliers (id, name, pos_code, pos_name, pos_barcode_source, pos_next_barcode, price_mode, price_multiplier),
       document_lines (barcode, retail_price)`,
    )
    .eq("id", documentId)
    .eq("business_id", businessId)
    .maybeSingle();
  const supplier = document?.suppliers;
  if (document && supplier) {
    const lines = document.document_lines;
    const change: Database["public"]["Tables"]["suppliers"]["Update"] = {};
    let code = supplier.pos_code;
    if (!code) {
      const { data: others } = await supabase.from("suppliers").select("pos_code").eq("business_id", businessId);
      const taken = (others ?? []).map((other) => Number(other.pos_code)).filter((n) => Number.isInteger(n) && n > 0);
      code = String(Math.max(0, ...taken) + 1);
      change.pos_code = code;
    }
    if (!supplier.pos_name) {
      change.pos_name = supplier.name;
    }
    if (!supplier.pos_next_barcode && supplier.pos_barcode_source === "internal") {
      if (!supplier.pos_code && lines.length > 0 && lines.every((line) => line.barcode)) {
        // Never set up by hand, and every row carries the supplier's own barcode: use it.
        change.pos_barcode_source = "supplier";
      } else {
        change.pos_next_barcode = `B${code.replace(/\D/g, "").padStart(2, "0").slice(-6)}000001`;
      }
    }
    if (supplier.price_mode === "multiplier" && !supplier.price_multiplier) {
      if (lines.length > 0 && lines.every((line) => line.retail_price)) {
        change.price_mode = "retail";
      } else {
        change.price_multiplier = DEFAULT_MULTIPLIER;
      }
    }
    if (Object.keys(change).length > 0) {
      await supabase.from("suppliers").update(change).eq("id", supplier.id).eq("business_id", businessId);
    }
  }

  const { count } = await supabase
    .from("pos_departments")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);
  if (count === 0) {
    // Only owners and managers may add departments; for anyone else this changes nothing.
    await supabase.from("pos_departments").insert({ business_id: businessId, ...DEFAULT_DEPARTMENT });
  }
}
