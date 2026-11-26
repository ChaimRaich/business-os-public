import type { Metadata } from "next";
import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UploadForm } from "@/components/upload-form";

export const metadata: Metadata = { title: "קליטה חדשה" };

export default async function NewReceivingPage() {
  const { active } = await requireBusiness();
  const supabase = await createClient();
  const { data: warehouses, error } = await supabase
    .from("warehouses")
    .select("id, name, is_default")
    .eq("business_id", active.businessId)
    .order("created_at");
  if (error) {
    throw new Error(`Failed to load warehouses: ${error.message}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/receiving" className="text-sm text-muted underline-offset-4 hover:underline">
          → כל הקליטות
        </Link>
        <h1 className="mt-1 text-2xl font-bold">קליטה חדשה</h1>
      </div>
      <UploadForm businessId={active.businessId} warehouses={warehouses} />
    </div>
  );
}
