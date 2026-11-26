import type { Metadata } from "next";
import Link from "next/link";
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
        <h1 className="text-2xl font-bold">מוצרים</h1>
        <Link href="/products/new" className="btn">
          מוצר חדש
        </Link>
      </div>

      <form action="/products" role="search" className="flex gap-2">
        <label className="sr-only" htmlFor="q">חיפוש מוצר</label>
        <input
          className="field"
          id="q"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="שם, ספק, ברקוד או מק״ט"
          autoComplete="off"
        />
        <button type="submit" className="btn-quiet shrink-0">
          חיפוש
        </button>
      </form>

      <section className="card">
        {shown.length === 0 ? (
          query ? (
            <p className="text-sm text-muted">
              לא נמצא מוצר שמתאים ל״{query}״. בדקו את האיות, או{" "}
              <Link href="/products" className="font-medium text-accent underline-offset-4 hover:underline">
                הציגו את כל המוצרים
              </Link>
              .
            </p>
          ) : (
            <p className="text-sm text-muted">
              הקטלוג ריק. הוסיפו את המוצר הראשון עם הברקוד והמק״טים שלו, והוא יופיע כאן.
            </p>
          )
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
                    className="-mx-2 block rounded-lg px-2 py-3 hover:bg-canvas"
                  >
                    <span className="flex flex-wrap items-baseline gap-x-3">
                      <span className="font-medium">{product.name}</span>
                      <span className="text-sm text-muted">
                        {[
                          product.suppliers?.name,
                          product.product_variants.length > 1 && `${product.product_variants.length} וריאציות`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    {codes.length > 0 && (
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        {codes.slice(0, 8).map((code) => (
                          <span key={code.id} className="rounded-md bg-canvas px-2 py-0.5 text-xs text-muted">
                            {CODE_KIND_LABELS[code.kind]} <bdi dir="ltr" className="font-mono text-ink">{code.code}</bdi>
                          </span>
                        ))}
                        {codes.length > 8 && (
                          <span className="px-1 py-0.5 text-xs text-muted">ועוד {codes.length - 8}</span>
                        )}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {hasMore && (
          <p className="mt-4 border-t border-line pt-4 text-sm text-muted">
            מוצגים {PAGE_SIZE} המוצרים האחרונים. חפשו כדי לצמצם את הרשימה.
          </p>
        )}
      </section>
    </div>
  );
}
