import type { NextRequest } from "next/server";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildPosWorkbook, type PosExportRow } from "@/lib/pos-export";

/** Downloads a till file. Read-only: downloading again never changes stock. */
export async function GET(_request: NextRequest, context: RouteContext<"/receiving/[id]/export/[exportId]">) {
  const { id, exportId } = await context.params;
  const { active } = await requireBusiness();
  const supabase = await createClient();
  const { data } = await supabase
    .from("pos_exports")
    .select("rows, sheet_name, created_at, documents (doc_number)")
    .eq("id", exportId)
    .eq("document_id", id)
    .eq("business_id", active.businessId)
    .maybeSingle();
  if (!data) {
    return new Response("Not found", { status: 404 });
  }

  const file = buildPosWorkbook(data.rows as PosExportRow[], data.sheet_name);
  const name = `${data.sheet_name} ${data.documents.doc_number ?? data.created_at.slice(0, 10)}.xls`;
  return new Response(new Uint8Array(file), {
    headers: {
      "content-type": "application/vnd.ms-excel",
      "content-disposition": `attachment; filename="export.xls"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "cache-control": "private, no-store",
    },
  });
}
