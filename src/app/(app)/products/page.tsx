import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Package, Plus, Search, X } from "lucide-react";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CODE_KIND_LABELS } from "@/lib/catalog";

export const metadata: Metadata = { title: "מוצרים" };

const PAGE_SIZE = 50;

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const { q } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q)?.trim() ?? "";

  const { active } = await requireBusiness();
  const supabase = await createClient();
  const { data: products, error } = await supabase
    .rpc("search_products", { p_business_id: active.businessId, p_query: query })
    .select("id, name, suppliers (name), product_variants (id, label, variant_codes (id, kind, code))")
    .limit(PAGE_SIZE + 1);
  if (error) {
    throw new Error(`Failed to search products: ${error.message}`);
  }
  const hasMore = products.length > PAGE_SIZE;
  const shown = products.slice(0, PAGE_SIZE);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">מוצרים</h1>
          <p className="mt-0.5 text-sm text-muted">דגמים, וריאציות, ברקודים ומיפויי מק״טים</p>
        </div>
        <Link href="/products/new" className="btn">
          <Plus className="size-4" aria-hidden />
          <span>מוצר חדש</span>
        </Link>
      </div>

      <form action="/products" role="search" className="flex gap-2">
        <label className="sr-only" htmlFor="q">חיפוש מוצר</label>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            className="field ps-10 pe-10"
            id="q"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="חיפוש לפי שם, ספק, ברקוד או מק״ט…"
            autoComplete="off"
          />
          {query && (
            <Link
              href="/products"
              aria-label="ניקוי חיפוש"
              className="absolute end-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-muted hover:bg-surface-subtle hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </Link>
          )}
        </div>
        <button type="submit" className="btn-quiet shrink-0">
          חיפוש
        </button>
      </form>

      <section className="card p-2 sm:p-3">
        {shown.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <span className="mb-3 inline-flex size-12 items-center justify-center rounded-2xl bg-surface-subtle text-muted">
              <Package className="size-6" aria-hidden />
            </span>
            {query ? (
              <>
                <p className="text-sm font-semibold text-ink">לא נמצא מוצר שמתאים ל״{query}״</p>
                <p className="mt-1 text-sm text-muted">בדקו את האיות או נסו לחפש לפי ברקוד או מק״ט ספק.</p>
                <Link href="/products" className="btn-quiet mt-4 min-h-9 px-3.5 text-xs">
                  הצגת כל המוצרים
                </Link>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-ink">הקטלוג עדיין ריק</p>
                <p className="mt-1 max-w-sm text-sm text-muted">
                  הוסיפו את המוצר הראשון עם הברקוד והמק״טים שלו, או העלו תעודת משלוח וצרו מוצרים ישירות ממנה.
                </p>
                <Link href="/products/new" className="btn mt-4">
                  <Plus className="size-4" aria-hidden />
                  <span>הוספת מוצר ראשון</span>
                </Link>
              </>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((product) => {
              // Variants of one model share the supplier SKU; show each distinct code once.
              const seen = new Set<string>();
              const codes = product.product_variants
                .flatMap((variant) => variant.variant_codes)
                .filter((code) => {
                  const key = `${code.kind}:${code.code.toUpperCase()}`;
                  return seen.has(key) ? false : (seen.add(key), true);
                });
              return (
                <li key={product.id}>
                  <Link
                    href={`/products/${product.id}`}
                    className="group flex items-center gap-4 rounded-xl px-3 py-3.5 transition-colors hover:bg-surface-subtle/70"
                  >
                    <span className="hidden size-10 shrink-0 items-center justify-center rounded-xl bg-surface-subtle text-muted transition-colors group-hover:bg-accent-soft group-hover:text-accent-strong sm:inline-flex">
                      <Package className="size-4.5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink group-hover:text-accent-strong">{product.name}</span>
                        {product.suppliers?.name && (
                          <span className="rounded-full bg-surface-subtle px-2.5 py-0.5 text-xs font-medium text-muted">
                            {product.suppliers.name}
                          </span>
                        )}
                        {product.product_variants.length > 1 && (
                          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-strong">
                            {product.product_variants.length} וריאציות
                          </span>
                        )}
                      </span>
                      {codes.length > 0 && (
                        <span className="mt-2 flex flex-wrap gap-1.5">
                          {codes.slice(0, 8).map((code) => (
                            <span
                              key={code.id}
                              className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-0.5 text-xs text-muted"
                            >
                              <span>{CODE_KIND_LABELS[code.kind]}</span>
                              <bdi dir="ltr" className="font-mono font-medium text-ink">{code.code}</bdi>
                            </span>
                          ))}
                          {codes.length > 8 && (
                            <span className="px-1.5 py-0.5 text-xs text-muted">+{codes.length - 8}</span>
                          )}
                        </span>
                      )}
                    </span>
                    <ChevronLeft className="size-4 shrink-0 text-muted/60 transition-transform group-hover:-translate-x-0.5 group-hover:text-accent" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {hasMore && (
          <p className="mt-2 border-t border-line px-3 pt-3 pb-1 text-sm text-muted">
            מוצגים {PAGE_SIZE} המוצרים האחרונים. חפשו כדי לצמצם את הרשימה.
          </p>
        )}
      </section>
    </div>
  );
}
