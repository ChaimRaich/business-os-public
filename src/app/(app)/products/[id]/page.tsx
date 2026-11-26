import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { CODE_KIND_LABELS, CODE_KINDS } from "@/lib/catalog";
import { ActionForm } from "@/components/action-form";
import {
  addCode,
  addVariant,
  deleteCode,
  deleteProduct,
  deleteVariant,
  renameVariant,
  updateProduct,
} from "../actions";

export const metadata: Metadata = { title: "מוצר" };

export default async function ProductPage({ params }: PageProps<"/products/[id]">) {
  const { id } = await params;
  const { active } = await requireBusiness();
  const canDelete = can(active.role, "catalog.delete");

  const supabase = await createClient();
  const [{ data: product }, { data: suppliers }] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, notes, supplier_id, product_variants (id, label, created_at, variant_codes (id, kind, code, created_at, suppliers (name)))",
      )
      .eq("id", id)
      .eq("business_id", active.businessId)
      .order("created_at", { referencedTable: "product_variants" })
      .maybeSingle(),
    supabase.from("suppliers").select("id, name").eq("business_id", active.businessId).order("name"),
  ]);
  if (!product) {
    notFound();
  }
  const supplierOptions = suppliers ?? [];
  const variants = product.product_variants;
  const hasVariants = variants.length > 1 || variants[0]?.label !== "";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/products" className="text-sm text-muted underline-offset-4 hover:underline">
          → כל המוצרים
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{product.name}</h1>
      </div>

      <section className="card">
        <h2 className="mb-4 font-semibold">פרטי המוצר</h2>
        <ActionForm action={updateProduct} submitLabel="שמירה" className="flex flex-col gap-4">
          <input type="hidden" name="id" value={product.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="product-name">שם המוצר</label>
              <input className="field" id="product-name" name="name" defaultValue={product.name} maxLength={200} required />
            </div>
            <div>
              <label className="label" htmlFor="product-supplier">ספק</label>
              <select className="field min-h-11" id="product-supplier" name="supplier_id" defaultValue={product.supplier_id ?? ""}>
                <option value="">ללא ספק</option>
                {supplierOptions.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="product-notes">הערות</label>
              <input className="field" id="product-notes" name="notes" defaultValue={product.notes ?? ""} />
            </div>
          </div>
        </ActionForm>
      </section>

      {variants.map((variant) => {
        const codes = [...variant.variant_codes].sort((a, b) => a.created_at.localeCompare(b.created_at));
        return (
          <section key={variant.id} className="card">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">
                {hasVariants ? variant.label || "ללא שם" : "מק״טים"}
              </h2>
              {hasVariants && (
                <ActionForm
                  action={renameVariant}
                  submitLabel="שינוי שם"
                  submitClassName="btn-quiet"
                  className="flex flex-wrap items-center gap-2"
                >
                  <input type="hidden" name="product_id" value={product.id} />
                  <input type="hidden" name="variant_id" value={variant.id} />
                  <label className="sr-only" htmlFor={`label-${variant.id}`}>שם הווריאציה</label>
                  <input className="field w-36 py-2 text-sm" id={`label-${variant.id}`} name="label" defaultValue={variant.label} maxLength={80} required />
                </ActionForm>
              )}
            </div>

            {codes.length === 0 ? (
              <p className="text-sm text-muted">עוד אין קודים. הוסיפו ברקוד או מק״ט כדי שאפשר יהיה למצוא את הפריט.</p>
            ) : (
              <ul className="divide-y divide-line">
                {codes.map((code) => (
                  <li key={code.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                    <span className="w-24 shrink-0 text-sm text-muted">{CODE_KIND_LABELS[code.kind]}</span>
                    <bdi dir="ltr" className="min-w-0 flex-1 basis-32 break-all text-right font-mono">{code.code}</bdi>
                    {code.suppliers && <span className="text-sm text-muted">{code.suppliers.name}</span>}
                    <ActionForm
                      action={deleteCode}
                      submitLabel="מחיקה"
                      pendingLabel="מוחק…"
                      submitClassName="min-h-11 px-2 text-sm text-danger underline-offset-4 hover:underline"
                    >
                      <input type="hidden" name="product_id" value={product.id} />
                      <input type="hidden" name="code_id" value={code.id} />
                    </ActionForm>
                  </li>
                ))}
              </ul>
            )}

            <ActionForm
              action={addCode}
              submitLabel="הוספת קוד"
              submitClassName="btn-quiet"
              className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4"
            >
              <input type="hidden" name="product_id" value={product.id} />
              <input type="hidden" name="variant_id" value={variant.id} />
              <div>
                <label className="label" htmlFor={`kind-${variant.id}`}>סוג</label>
                <select className="field min-h-11 w-auto" id={`kind-${variant.id}`} name="kind" defaultValue="barcode">
                  {CODE_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {CODE_KIND_LABELS[kind]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0 flex-1 basis-40">
                <label className="label" htmlFor={`code-${variant.id}`}>קוד</label>
                <input className="field" id={`code-${variant.id}`} name="code" dir="ltr" autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={64} required />
              </div>
              <div>
                <label className="label" htmlFor={`supplier-${variant.id}`}>ספק (למק״ט ספק)</label>
                <select className="field min-h-11 w-auto" id={`supplier-${variant.id}`} name="supplier_id" defaultValue={product.supplier_id ?? ""}>
                  <option value="">—</option>
                  {supplierOptions.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </div>
            </ActionForm>

            {canDelete && variants.length > 1 && (
              <ActionForm
                action={deleteVariant}
                submitLabel={`מחיקת הווריאציה ${variant.label}`}
                pendingLabel="מוחק…"
                submitClassName="mt-3 min-h-11 text-sm text-danger underline-offset-4 hover:underline"
              >
                <input type="hidden" name="product_id" value={product.id} />
                <input type="hidden" name="variant_id" value={variant.id} />
              </ActionForm>
            )}
          </section>
        );
      })}

      <section className="card">
        <h2 className="font-semibold">הוספת וריאציה</h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          מידה, צבע או כל הבדל אחר שיש לו ברקוד משלו.
          {!hasVariants && " הפריט הקיים יישאר כווריאציה ללא שם; אפשר לתת לו שם אחרי ההוספה."}
        </p>
        <ActionForm action={addVariant} submitLabel="הוספה" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="product_id" value={product.id} />
          <div className="min-w-0 flex-1 basis-48">
            <label className="label" htmlFor="new-variant">שם הווריאציה</label>
            <input className="field" id="new-variant" name="label" placeholder="מידה 7" maxLength={80} required />
          </div>
        </ActionForm>
      </section>

      {canDelete && (
        <section className="card border-danger/30">
          <h2 className="font-semibold">מחיקת המוצר</h2>
          <p className="mt-1 mb-4 text-sm text-muted">
            המוצר יימחק יחד עם כל הווריאציות והקודים שלו. אי אפשר לבטל את הפעולה.
          </p>
          <ActionForm
            action={deleteProduct}
            submitLabel="מחיקת המוצר לצמיתות"
            pendingLabel="מוחק…"
            submitClassName="btn-quiet text-danger"
          >
            <input type="hidden" name="id" value={product.id} />
          </ActionForm>
        </section>
      )}
    </div>
  );
}
