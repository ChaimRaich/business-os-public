import type { Metadata } from "next";
import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/components/action-form";
import { SupplierFields } from "@/components/supplier-fields";
import { createSupplier } from "./actions";

export const metadata: Metadata = { title: "ספקים" };

export default async function SuppliersPage() {
  const { active } = await requireBusiness();
  const supabase = await createClient();
  const { data: suppliers, error } = await supabase
    .from("suppliers")
    .select("id, name, phone, pos_code, products (count)")
    .eq("business_id", active.businessId)
    .order("name");
  if (error) {
    throw new Error(`Failed to load suppliers: ${error.message}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">ספקים</h1>

      <section className="card">
        {suppliers.length === 0 ? (
          <p className="text-sm text-muted">
            עוד אין ספקים. הוסיפו את הספק הראשון בטופס שלמטה כדי לשייך אליו מוצרים ומק״טים.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {suppliers.map((supplier) => (
              <li key={supplier.id}>
                <Link
                  href={`/suppliers/${supplier.id}`}
                  className="-mx-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-2 py-3 hover:bg-canvas"
                >
                  <span className="min-w-0 flex-1 basis-40 truncate font-medium">{supplier.name}</span>
                  <span className="text-sm text-muted">
                    {supplier.products[0]?.count ?? 0} מוצרים
                  </span>
                  <span className="text-sm text-muted">
                    {supplier.pos_code ? (
                      <>קוד בקופה: <bdi dir="ltr">{supplier.pos_code}</bdi></>
                    ) : (
                      "ללא קוד בקופה"
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="mb-4 font-semibold">ספק חדש</h2>
        <ActionForm action={createSupplier} submitLabel="הוספת ספק" className="flex flex-col gap-4">
          <SupplierFields />
        </ActionForm>
      </section>
    </div>
  );
}
