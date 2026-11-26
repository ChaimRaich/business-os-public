import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Serves the stored file, byte for byte. Downloading changes nothing. */
export async function GET(_: Request, { params }: RouteContext<"/receiving/[id]/export">) {
  const { id } = await params;
  const { active } = await requireBusiness();
  const supabase = await createClient();
  const { data } = await supabase
    .from("pos_exports")
    .select("file_name, content_base64")
    .eq("document_id", id)
    .eq("business_id", active.businessId)
    .maybeSingle();
  if (!data) {
    return new Response("הקובץ לא נמצא.", { status: 404 });
  }
  return new Response(new Uint8Array(Buffer.from(data.content_base64, "base64")), {
    headers: {
      "Content-Type": "application/vnd.ms-excel",
      "Content-Disposition": `attachment; filename="pos-upload.xls"; filename*=UTF-8''${encodeURIComponent(data.file_name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
