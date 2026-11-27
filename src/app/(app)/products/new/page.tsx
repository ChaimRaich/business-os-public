import type { Metadata } from "next";
import Link from "next/link";
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
        <Link href="/products" className="text-sm text-muted underline-offset-4 hover:underline">
          → כל המוצרים
        </Link>
        <h1 className="mt-1 text-3xl sm:text-4xl">מוצר חדש</h1>
      </div>
      {suppliers.length === 0 && (
        <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-strong">
          עוד אין ספקים. כדי לשמור מק״ט ספק צריך קודם{" "}
          <Link href="/suppliers" className="font-semibold underline underline-offset-4">
            להוסיף ספק
          </Link>
          .
        </p>
      )}
      <ProductForm action={createProduct} suppliers={suppliers} />
    </div>
  );
}
