import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Info } from "lucide-react";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ProductForm } from "@/components/product-form";
import { createProduct } from "../actions";

export const metadata: Metadata = { title: "מוצר חדש" };

export default async function NewProductPage() {
  const { active } = await requireBusiness();
  const supabase = await createClient();
  const { data: suppliers, error } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("business_id", active.businessId)
    .order("name");
  if (error) {
    throw new Error(`Failed to load suppliers: ${error.message}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/products" className="back-link">
          <ArrowRight className="size-4" aria-hidden />
          <span>כל המוצרים</span>
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight">מוצר חדש</h1>
      </div>
      {suppliers.length === 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-accent/25 bg-accent-soft px-4 py-3.5 text-sm text-accent-strong">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            עוד אין ספקים. כדי לשמור מק״ט ספק צריך קודם{" "}
            <Link href="/suppliers" className="font-semibold underline underline-offset-4">
              להוסיף ספק
            </Link>
            .
          </p>
        </div>
      )}
      <ProductForm action={createProduct} suppliers={suppliers} />
    </div>
  );
}
