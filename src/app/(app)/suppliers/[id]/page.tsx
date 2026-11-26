import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/components/action-form";
import { SupplierFields } from "@/components/supplier-fields";
import { updateSupplier } from "../actions";

export const metadata: Metadata = { title: "ספק" };

export default async function SupplierPage({ params }: PageProps<"/suppliers/[id]">) {
  const { id } = await params;
  const { active } = await requireBusiness();
  const supabase = await createClient();
  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id, name, tax_id, phone, address, pos_code, pos_name, notes, club_multiplier, sale_markup_pct, next_barcode_number, products (id, name)")
    .eq("id", id)
    .eq("business_id", active.businessId)
    .order("name", { referencedTable: "products" })
    .maybeSingle();
  if (!supplier) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/suppliers" className="text-sm text-muted underline-offset-4 hover:underline">
          → כל הספקים
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{supplier.name}</h1>
      </div>

      <section className="card">
        <h2 className="mb-4 font-semibold">פרטי הספק</h2>
        <ActionForm action={updateSupplier} submitLabel="שמירה" className="flex flex-col gap-4">
          <input type="hidden" name="id" value={supplier.id} />
          <SupplierFields supplier={supplier} />
        </ActionForm>
      </section>

      <section className="card">
        <h2 className="mb-3 font-semibold">מוצרים של הספק</h2>
        {supplier.products.length === 0 ? (
          <p className="text-sm text-muted">עוד לא שויכו מוצרים לספק הזה.</p>
        ) : (
          <ul className="divide-y divide-line">
            {supplier.products.map((product) => (
              <li key={product.id}>
                <Link href={`/products/${product.id}`} className="-mx-2 block rounded-lg px-2 py-3 hover:bg-canvas">
                  {product.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
