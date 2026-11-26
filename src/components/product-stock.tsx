import Link from "next/link";
import { Boxes, History, SlidersHorizontal } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatQuantity, itemTitle, MOVEMENT_KIND_LABELS } from "@/lib/stock";

const HISTORY_LIMIT = 100;

/** Balance per warehouse and the movement history of one product. */
export async function ProductStock({
  businessId,
  variants,
  canAdjust,
}: {
  businessId: string;
  variants: { id: string; label: string }[];
  canAdjust: boolean;
}) {
  const supabase = await createClient();
  const ids = variants.map((variant) => variant.id);
  const [balances, movements] = await Promise.all([
    supabase
      .from("stock_balances")
      .select("variant_id, quantity, warehouses (name)")
      .eq("business_id", businessId)
      .in("variant_id", ids),
    supabase
      .from("stock_movements")
      .select("id, variant_id, kind, quantity, reason, created_at, warehouses (name), documents (id, doc_number)")
      .eq("business_id", businessId)
      .in("variant_id", ids)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
  ]);
  if (balances.error || movements.error) {
    throw new Error(`Failed to load stock: ${(balances.error ?? movements.error)!.message}`);
  }
  const labelOf = new Map(variants.map((variant) => [variant.id, variant.label]));

  return (
    <section className="card">
      <h2 className="section-heading mb-4">
        <Boxes className="size-4.5 text-accent" aria-hidden />
        <span>יתרות מלאי</span>
      </h2>
      <ul className="divide-y divide-line">
        {variants.map((variant) => {
          const rows = balances.data.filter((balance) => balance.variant_id === variant.id);
          return (
            <li key={variant.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 text-sm">
              {variants.length > 1 && <span className="w-28 font-semibold text-ink">{variant.label || "ללא שם"}</span>}
              <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                {rows.length === 0 ? (
                  <span className="text-muted">עוד אין תנועות מלאי.</span>
                ) : (
                  rows.map((row, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface-subtle/70 px-3 py-1 text-xs font-medium"
                    >
                      <span className="text-muted">{row.warehouses.name}:</span>
                      <span className="font-bold tabular-nums text-ink">{formatQuantity(row.quantity)}</span>
                    </span>
                  ))
                )}
              </div>
              {canAdjust && (
                <Link
                  href={`/stock/adjust?variant=${variant.id}`}
                  className="btn-quiet min-h-9 px-3 text-xs"
                >
                  <SlidersHorizontal className="size-3.5 text-accent" aria-hidden />
                  <span>
                    התאמת מלאי<span className="sr-only"> {variant.label}</span>
                  </span>
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      {movements.data.length > 0 && (
        <div className="mt-6 border-t border-line pt-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
            <History className="size-4 text-muted" aria-hidden />
            <span>היסטוריית תנועות</span>
          </h3>
          <ul className="divide-y divide-line">
            {movements.data.map((movement) => {
              const positive = movement.quantity > 0;
              return (
                <li key={movement.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                  <bdi
                    dir="ltr"
                    className={`inline-flex min-w-13 justify-center rounded-lg px-2 py-0.5 text-xs font-bold tabular-nums ${
                      positive ? "bg-accent-soft text-accent-strong" : "bg-danger-soft text-danger"
                    }`}
                  >
                    {positive ? "+" : ""}
                    {formatQuantity(movement.quantity)}
                  </bdi>
                  <span className="min-w-0 flex-1 basis-56 text-ink">
                    <span className="font-medium">
                      {itemTitle(MOVEMENT_KIND_LABELS[movement.kind], labelOf.get(movement.variant_id) ?? "")}
                    </span>
                    <span className="text-muted"> · {movement.warehouses.name}</span>
                    {movement.reason && <span className="text-muted"> · {movement.reason}</span>}
                    {movement.documents && (
                      <>
                        <span className="text-muted"> · </span>
                        <Link
                          href={`/receiving/${movement.documents.id}`}
                          className="font-medium text-accent underline underline-offset-2"
                        >
                          מסמך {movement.documents.doc_number ?? "ללא מספר"}
                        </Link>
                      </>
                    )}
                  </span>
                  <span className="text-xs text-muted">{formatDateTime(movement.created_at)}</span>
                </li>
              );
            })}
          </ul>
          {movements.data.length === HISTORY_LIMIT && (
            <p className="mt-2 text-xs text-muted">מוצגות {HISTORY_LIMIT} התנועות האחרונות.</p>
          )}
        </div>
      )}
    </section>
  );
}
