import type { Metadata } from "next";
import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import {
  formatQuantity,
  isStockState,
  STOCK_STATE_ABOUT,
  STOCK_STATE_LABELS,
  STOCK_STATE_STYLES,
  type StockState,
} from "@/lib/stock";

export const metadata: Metadata = { title: "חוסרים" };

const LIMIT = 500;
const SHORT: Exclude<StockState, "ok">[] = ["negative", "out", "low"];

export default async function StockReportPage() {
  const { active } = await requireBusiness();
  const supabase = await createClient();
  const [shortResult, okResult, businessResult, importResult] = await Promise.all([
    supabase
      .rpc("stock_overview", { p_business_id: active.businessId }, { count: "exact" })
      .neq("state", "ok")
      .order("supplier_name", { nullsFirst: false })
      .order("product_name")
      .limit(LIMIT),
    supabase.rpc("stock_overview", { p_business_id: active.businessId }, { count: "exact", head: true }).eq("state", "ok"),
    supabase.from("businesses").select("low_stock_default").eq("id", active.businessId).single(),
    supabase
      .from("sales_imports")
      .select("created_at")
      .eq("business_id", active.businessId)
      .is("reverted_at", null)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  const failed = shortResult.error ?? okResult.error ?? businessResult.error ?? importResult.error;
  if (failed) {
    throw new Error(`Failed to load the stock report: ${failed.message}`);
  }
  const rows = shortResult.data ?? [];
  const fallback = businessResult.data?.low_stock_default ?? null;
  const lastImport = importResult.data?.[0]?.created_at;
  const bySupplier = new Map<string, { id: string; name: string; count: number }>();
  for (const row of rows) {
    if (!row.supplier_id) continue;
    const entry = bySupplier.get(row.supplier_id) ?? { id: row.supplier_id, name: row.supplier_name ?? "ספק", count: 0 };
    entry.count += 1;
    bySupplier.set(row.supplier_id, entry);
  }
  const orderSuppliers = [...bySupplier.values()].sort((a, b) => b.count - a.count);
  const when = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl sm:text-4xl">חוסרים</h1>
        <p className="mt-1 max-w-prose text-sm text-muted">
          רק פריטים שנקלטו או נמכרו דרך המערכת.
        </p>
      </div>

      <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn" role="status">
        {lastImport
          ? `המלאי מעודכן לדוח המכירות מ-${when.format(new Date(lastImport))}. מה שנמכר מאז עוד לא ירד.`
          : "עוד לא יובא דוח מכירות: המלאי לא כולל מכירות."}{" "}
        <Link href="/settings/connections" className="font-medium underline underline-offset-4">
          מצב החיבורים
        </Link>
      </p>

      <section className="card">
        <h2 className="font-semibold">סף החוסר</h2>
        <p className="mt-1 max-w-prose text-sm text-muted">
          {fallback === null
            ? "אין סף כללי: רק פריטים עם סף משלהם יופיעו כ״מתחת לסף״."
            : `סף כללי: ${formatQuantity(fallback)} יחידות.`}
          {can(active.role, "business.edit") && (
            <>
              {" "}
              <Link href="/settings#low-stock" className="font-medium text-accent underline underline-offset-4">
                {fallback === null ? "הגדרת סף כללי" : "שינוי הסף הכללי"}
              </Link>
            </>
          )}
        </p>
      </section>

      {orderSuppliers.length > 0 && (
        <section className="card">
          <h2 className="font-semibold">טיוטת הזמנה לספק</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {orderSuppliers.map((supplier) => (
              <li key={supplier.id}>
                <Link href={`/reports/stock/order/${supplier.id}`} className="btn-quiet">
                  {supplier.name} ({supplier.count})
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rows.length === 0 ? (
        <section className="card">
          <p className="text-sm text-muted">
            {(okResult.count ?? 0) === 0
              ? "עוד אין פריטים במעקב."
              : `אין חוסרים: כל ${okResult.count} הפריטים שבמעקב מעל הסף.`}
          </p>
        </section>
      ) : (
        SHORT.map((state) => {
          const group = rows.filter((row) => row.state === state);
          if (group.length === 0) return null;
          return (
            <section key={state} className="card" aria-labelledby={`state-${state}`}>
              <div className="flex flex-wrap items-center gap-3">
                <h2 id={`state-${state}`} className="font-semibold">
                  {STOCK_STATE_LABELS[state]} ({group.length})
                </h2>
              </div>
              <p className="mt-1 text-sm text-muted">{STOCK_STATE_ABOUT[state]}</p>
              <ul className="mt-2 divide-y divide-line">
                {group.map((row) => (
                  <li key={row.variant_id}>
                    <Link
                      href={`/products/${row.product_id}`}
                      className="-mx-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-2 py-3 hover:bg-canvas"
                    >
                      <span className="min-w-0 flex-1 basis-56">
                        <span className="block truncate font-medium">
                          {row.product_name}
                          {row.variant_label && <span className="font-normal text-muted"> · {row.variant_label}</span>}
                        </span>
                        <span className="block text-sm text-muted">
                          {row.supplier_name ?? "ללא ספק"}
                          {row.sold_30_days > 0 && <> · נמכרו {formatQuantity(row.sold_30_days)} ב-30 הימים האחרונים</>}
                        </span>
                      </span>
                      {state === "low" && row.threshold !== null && (
                        <span className="text-sm text-muted">
                          סף {formatQuantity(row.threshold)}
                          {!row.own_threshold && " (כללי)"}
                        </span>
                      )}
                      <span className={`rounded-full px-3 py-1 text-sm tabular-nums ${STOCK_STATE_STYLES[isStockState(row.state) ? row.state : "ok"]}`}>
                        במלאי: <bdi dir="ltr">{formatQuantity(row.quantity)}</bdi>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}

      {(shortResult.count ?? 0) > LIMIT && (
        <p className="text-sm text-muted">מוצגים {LIMIT} מתוך {shortResult.count} פריטים.</p>
      )}
      {rows.length > 0 && (
        <p className="text-sm text-muted">
          {okResult.count === 1 ? "פריט אחד נוסף במעקב, מעל הסף." : `${okResult.count ?? 0} פריטים נוספים במעקב, מעל הסף.`}{" "}
          <Link href="/reports/sales" className="font-medium text-accent underline underline-offset-4">
            דוח מכירות
          </Link>
        </p>
      )}
    </div>
  );
}
