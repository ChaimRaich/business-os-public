import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Package, Plus, Truck } from "lucide-react";
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
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">ספקים</h1>
        <p className="mt-0.5 text-sm text-muted">פרטי ספקים, קודי קופה, כללי תמחור ומספרי ברקוד רצים</p>
      </div>

      <section className="card p-2 sm:p-3">
        {suppliers.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
            <span className="mb-3 inline-flex size-12 items-center justify-center rounded-2xl bg-surface-subtle text-muted">
              <Truck className="size-6" aria-hidden />
            </span>
            <p className="text-sm font-semibold text-ink">עוד אין ספקים</p>
            <p className="mt-1 max-w-sm text-sm text-muted">
              הוסיפו את הספק הראשון בטופס שלמטה כדי לשייך אליו מוצרים, מק״טים וכללי תמחור.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {suppliers.map((supplier) => (
              <li key={supplier.id}>
                <Link
                  href={`/suppliers/${supplier.id}`}
                  className="group flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-3 py-3.5 transition-colors hover:bg-surface-subtle/70"
                >
                  <span className="hidden size-10 shrink-0 items-center justify-center rounded-xl bg-surface-subtle text-muted transition-colors group-hover:bg-accent-soft group-hover:text-accent-strong sm:inline-flex">
                    <Truck className="size-4.5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 basis-40">
                    <span className="block truncate font-semibold text-ink group-hover:text-accent-strong">
                      {supplier.name}
                    </span>
                    {supplier.phone && (
                      <bdi dir="ltr" className="block text-right text-xs text-muted">
                        {supplier.phone}
                      </bdi>
                    )}
                  </span>
                  <span className="badge bg-surface-subtle text-muted">
                    <Package className="size-3.5" aria-hidden />
                    <span className="tabular-nums">{supplier.products[0]?.count ?? 0} מוצרים</span>
                  </span>
                  {supplier.pos_code ? (
                    <span className="badge bg-accent-soft text-accent-strong">
                      קוד קופה: <bdi dir="ltr" className="font-mono">{supplier.pos_code}</bdi>
                    </span>
                  ) : (
                    <span className="badge bg-warning-soft text-warning">ללא קוד בקופה</span>
                  )}
                  <ChevronLeft className="size-4 shrink-0 text-muted/60 transition-transform group-hover:-translate-x-0.5 group-hover:text-accent" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="section-heading mb-5">
          <Plus className="size-4.5 text-accent" aria-hidden />
          <span>הוספת ספק חדש</span>
        </h2>
        <ActionForm action={createSupplier} submitLabel="הוספת ספק" submitClassName="btn sm:self-start" className="flex flex-col gap-5">
          <SupplierFields />
        </ActionForm>
      </section>
    </div>
  );
}
