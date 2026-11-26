import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { planExport, ExportLine } from "@/lib/pos-export";
import { itemTitle } from "@/lib/stock";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Everything the POS file is built from, for one document of one business.
 * Null when the document, its supplier or its items cannot be found.
 */
export async function loadExportData(supabase: Client, businessId: string, documentId: string) {
  const { data: document, error } = await supabase
    .from("documents")
    .select(
      `status, doc_number,
       suppliers (id, name, pos_code, pos_name, club_multiplier, sale_markup_pct),
       document_lines (position, quantity, unit_cost, sale_price, club_price, product_type, material,
         product_variants (id, label, variant_codes (kind, code, allocated),
           products (id, name, sale_price, club_price, product_type, material)))`,
    )
    .eq("id", documentId)
    .eq("business_id", businessId)
    .order("position", { referencedTable: "document_lines" })
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load export data: ${error.message}`);
  }
  if (!document?.suppliers) {
    return null;
  }
  const supplier = document.suppliers;

  const lines: ExportLine[] = [];
  const titles = new Map<string, string>();
  const knownToPos = new Set<string>();
  for (const line of document.document_lines) {
    const variant = line.product_variants;
    if (!variant || line.quantity === null) {
      return null;
    }
    const product = variant.products;
    const title = itemTitle(product.name, variant.label);
    const posCode = variant.variant_codes.find((code) => code.kind === "pos");
    titles.set(variant.id, title);
    // A POS code this system did not generate came from the POS itself.
    if (posCode && !posCode.allocated) {
      knownToPos.add(variant.id);
    }
    lines.push({
      variantId: variant.id,
      title,
      productId: product.id,
      quantity: line.quantity,
      unitCost: line.unit_cost,
      salePrice: line.sale_price,
      clubPrice: line.club_price,
      productType: line.product_type,
      material: line.material,
      product: {
        salePrice: product.sale_price,
        clubPrice: product.club_price,
        productType: product.product_type,
        material: product.material,
      },
      posCode: posCode?.code ?? null,
    });
  }

  const [departments, earlier] = await Promise.all([
    supabase
      .from("departments")
      .select("product_type, code, department, sub_department")
      .eq("business_id", businessId),
    titles.size > 0
      ? supabase
          .from("pos_exports")
          .select("variant_ids")
          .eq("business_id", businessId)
          .neq("document_id", documentId)
          .overlaps("variant_ids", [...titles.keys()])
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (departments.error || earlier.error) {
    throw new Error(`Failed to load export data: ${(departments.error ?? earlier.error)!.message}`);
  }
  for (const record of earlier.data) {
    for (const variantId of record.variant_ids) {
      if (titles.has(variantId)) {
        knownToPos.add(variantId);
      }
    }
  }

  const input: Parameters<typeof planExport>[0] = {
    supplier: {
      name: supplier.name,
      posCode: supplier.pos_code,
      posName: supplier.pos_name,
      clubMultiplier: supplier.club_multiplier,
      saleMarkupPct: supplier.sale_markup_pct,
    },
    supplierHref: `/suppliers/${supplier.id}`,
    departments: departments.data.map((d) => ({
      productType: d.product_type,
      code: d.code,
      department: d.department,
      subDepartment: d.sub_department,
    })),
    lines,
  };
  return {
    status: document.status,
    docNumber: document.doc_number,
    input,
    existingInPos: [...knownToPos].map((id) => titles.get(id)!),
  };
}
