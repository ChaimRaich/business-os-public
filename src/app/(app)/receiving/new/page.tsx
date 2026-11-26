import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
        <Link href="/receiving" className="back-link">
          <ArrowRight className="size-4" aria-hidden />
          <span>כל הקליטות</span>
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight">קליטה חדשה</h1>
        <p className="mt-0.5 text-sm text-muted">בחרו מחסן והעלו צילום או PDF של החשבונית / תעודת המשלוח</p>
      </div>
      <UploadForm businessId={active.businessId} warehouses={warehouses} />
    </div>
  );
}
