import type { Metadata } from "next";
import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SalesImportForm } from "@/components/sales-import-form";

export const metadata: Metadata = { title: "ייבוא דוח מכירות" };

export default async function SalesImportPage() {
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
        <Link href="/sales" className="text-sm text-muted underline-offset-4 hover:underline">
          → כל המכירות
        </Link>
        <h1 className="mt-1 text-3xl sm:text-4xl">ייבוא דוח מכירות</h1>
      </div>
      <SalesImportForm businessId={active.businessId} warehouses={warehouses} />
    </div>
  );
}
