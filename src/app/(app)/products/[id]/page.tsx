import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowRight, Barcode, Layers, Package } from "lucide-react";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { CODE_KIND_LABELS, CODE_KINDS } from "@/lib/catalog";
import { ActionForm } from "@/components/action-form";
import { ProductStock } from "@/components/product-stock";
import { MATERIAL_LABELS, MATERIALS, PRODUCT_TYPE_LABELS, PRODUCT_TYPES } from "@/lib/pricing";
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
        "id, name, notes, supplier_id, product_type, material, sale_price, club_price, product_variants (id, label, created_at, variant_codes (id, kind, code, created_at, suppliers (name)))",
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
        <Link href="/products" className="back-link">
          <ArrowRight className="size-4" aria-hidden />
          <span>כל המוצרים</span>
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight">{product.name}</h1>
          {product.product_type && (
            <span className="badge bg-accent-soft text-accent-strong">
              {PRODUCT_TYPE_LABELS[product.product_type]}
            </span>
          )}
          {product.material && (
            <span className="badge bg-surface-subtle text-muted">
              {MATERIAL_LABELS[product.material]}
            </span>
          )}
        </div>
      </div>

      <section className="card">
        <h2 className="section-heading mb-4">
          <Package className="size-4.5 text-accent" aria-hidden />
          <span>פרטי המוצר</span>
        </h2>
        <ActionForm action={updateProduct} submitLabel="שמירת שינויים" submitClassName="btn sm:self-start" className="flex flex-col gap-4">
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
            <div>
              <label className="label" htmlFor="product-type">סוג</label>
              <select className="field min-h-11" id="product-type" name="product_type" defaultValue={product.product_type ?? ""}>
                <option value="">לא נבחר</option>
                {PRODUCT_TYPES.map((type) => (
                  <option key={type} value={type}>{PRODUCT_TYPE_LABELS[type]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="product-material">חומר</label>
              <select className="field min-h-11" id="product-material" name="material" defaultValue={product.material ?? ""}>
                <option value="">לא נבחר</option>
                {MATERIALS.map((material) => (
                  <option key={material} value={material}>{MATERIAL_LABELS[material]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="product-sale-price">מחיר מכירה (₪)</label>
              <input className="field tabular-nums" id="product-sale-price" name="sale_price" dir="ltr" inputMode="decimal" defaultValue={product.sale_price ?? ""} />
            </div>
            <div>
              <label className="label" htmlFor="product-club-price">מחיר מועדון (₪)</label>
              <input className="field tabular-nums" id="product-club-price" name="club_price" dir="ltr" inputMode="decimal" defaultValue={product.club_price ?? ""} />
            </div>
          </div>
        </ActionForm>
      </section>

      <ProductStock businessId={active.businessId} variants={variants} canAdjust={can(active.role, "stock.adjust")} />

      {variants.map((variant) => {
        const codes = [...variant.variant_codes].sort((a, b) => a.created_at.localeCompare(b.created_at));
        return (
          <section key={variant.id} className="card">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="section-heading">
                <Barcode className="size-4.5 text-accent" aria-hidden />
                <span>{hasVariants ? variant.label || "ללא שם" : "מק״טים וברקודים"}</span>
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
              <p className="rounded-xl bg-surface-subtle/60 px-4 py-3 text-sm text-muted">
                עוד אין קודים. הוסיפו ברקוד או מק״ט כדי שאפשר יהיה למצוא את הפריט.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {codes.map((code) => (
                  <li key={code.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                    <span className="badge bg-surface-subtle text-muted">{CODE_KIND_LABELS[code.kind]}</span>
                    <bdi dir="ltr" className="min-w-0 flex-1 basis-32 break-all text-right font-mono text-sm font-medium text-ink">
                      {code.code}
                    </bdi>
                    {code.suppliers && <span className="text-xs font-medium text-muted">{code.suppliers.name}</span>}
                    <ActionForm
                      action={deleteCode}
                      submitLabel="מחיקה"
                      pendingLabel="מוחק…"
                      submitClassName="min-h-10 cursor-pointer px-2 text-sm font-medium text-danger underline-offset-4 hover:underline"
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
                <input className="field font-mono text-sm" id={`code-${variant.id}`} name="code" dir="ltr" autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={64} required />
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
                submitClassName="mt-3 min-h-10 cursor-pointer text-sm font-medium text-danger underline-offset-4 hover:underline"
              >
                <input type="hidden" name="product_id" value={product.id} />
                <input type="hidden" name="variant_id" value={variant.id} />
              </ActionForm>
            )}
          </section>
        );
      })}

      <section className="card">
        <h2 className="section-heading">
          <Layers className="size-4.5 text-accent" aria-hidden />
          <span>הוספת וריאציה</span>
        </h2>
        <p className="mt-1.5 mb-4 text-sm text-muted">
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
        <section className="card border-danger/30 bg-danger-soft/30">
          <h2 className="section-heading text-danger">
            <AlertTriangle className="size-4.5" aria-hidden />
            <span>מחיקת המוצר</span>
          </h2>
          <p className="mt-1.5 mb-4 text-sm text-muted">
            המוצר יימחק יחד עם כל הווריאציות והקודים שלו. אי אפשר לבטל את הפעולה.
          </p>
          <ActionForm
            action={deleteProduct}
            submitLabel="מחיקת המוצר לצמיתות"
            pendingLabel="מוחק…"
            submitClassName="btn-danger"
          >
            <input type="hidden" name="id" value={product.id} />
          </ActionForm>
        </section>
      )}
    </div>
  );
}
