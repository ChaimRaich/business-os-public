import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronLeft, Package, Truck } from "lucide-react";
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
        <Link href="/suppliers" className="back-link">
          <ArrowRight className="size-4" aria-hidden />
          <span>כל הספקים</span>
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight">{supplier.name}</h1>
          {supplier.pos_code && (
            <span className="badge bg-accent-soft text-accent-strong">
              קוד בקופה: <bdi dir="ltr" className="font-mono">{supplier.pos_code}</bdi>
            </span>
          )}
        </div>
      </div>

      <section className="card">
        <h2 className="section-heading mb-5">
          <Truck className="size-4.5 text-accent" aria-hidden />
          <span>פרטי הספק ותמחור</span>
        </h2>
        <ActionForm action={updateSupplier} submitLabel="שמירת שינויים" submitClassName="btn sm:self-start" className="flex flex-col gap-5">
          <input type="hidden" name="id" value={supplier.id} />
          <SupplierFields supplier={supplier} />
        </ActionForm>
      </section>

      <section className="card">
        <h2 className="section-heading mb-4">
          <Package className="size-4.5 text-accent" aria-hidden />
          <span>מוצרים של הספק ({supplier.products.length})</span>
        </h2>
        {supplier.products.length === 0 ? (
          <p className="rounded-xl bg-surface-subtle/60 px-4 py-3 text-sm text-muted">
            עוד לא שויכו מוצרים לספק הזה.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {supplier.products.map((product) => (
              <li key={product.id}>
                <Link
                  href={`/products/${product.id}`}
                  className="group -mx-2 flex items-center justify-between rounded-xl px-3 py-3 transition-colors hover:bg-surface-subtle"
                >
                  <span className="font-medium text-ink group-hover:text-accent-strong">{product.name}</span>
                  <ChevronLeft className="size-4 text-muted/60 transition-transform group-hover:-translate-x-0.5 group-hover:text-accent" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
