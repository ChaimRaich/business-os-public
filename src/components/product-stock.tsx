import Link from "next/link";
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
      <h2 className="mb-3 font-semibold">מלאי</h2>
      <ul className="divide-y divide-line">
        {variants.map((variant) => {
          const rows = balances.data.filter((balance) => balance.variant_id === variant.id);
          return (
            <li key={variant.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
              {variants.length > 1 && <span className="w-28 font-medium">{variant.label || "ללא שם"}</span>}
              <span className="min-w-0 flex-1">
                {rows.length === 0
                  ? "עוד אין תנועות."
                  : rows.map((row) => `${row.warehouses.name}: ${formatQuantity(row.quantity)}`).join(" · ")}
              </span>
              {canAdjust && (
                <Link href={`/stock/adjust?variant=${variant.id}`} className="text-accent underline underline-offset-4">
                  התאמת מלאי<span className="sr-only"> {variant.label}</span>
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      {movements.data.length > 0 && (
        <>
          <h3 className="mt-5 mb-2 text-sm font-semibold">היסטוריית תנועות</h3>
          <ul className="divide-y divide-line">
            {movements.data.map((movement) => (
              <li key={movement.id} className="flex flex-wrap gap-x-4 gap-y-1 py-2 text-sm">
                <bdi dir="ltr" className="w-14 font-semibold tabular-nums">
                  {movement.quantity > 0 ? "+" : ""}{formatQuantity(movement.quantity)}
                </bdi>
                <span className="min-w-0 flex-1 basis-56">
                  {itemTitle(MOVEMENT_KIND_LABELS[movement.kind], labelOf.get(movement.variant_id) ?? "")} ·{" "}
                  {movement.warehouses.name}
                  {movement.reason && ` · ${movement.reason}`}
                  {movement.documents && (
                    <>
                      {" "}·{" "}
                      <Link href={`/receiving/${movement.documents.id}`} className="underline underline-offset-2">
                        מסמך {movement.documents.doc_number ?? "ללא מספר"}
                      </Link>
                    </>
                  )}
                </span>
                <span className="text-muted">{formatDateTime(movement.created_at)}</span>
              </li>
            ))}
          </ul>
          {movements.data.length === HISTORY_LIMIT && (
            <p className="mt-2 text-xs text-muted">מוצגות {HISTORY_LIMIT} התנועות האחרונות.</p>
          )}
        </>
      )}
    </section>
  );
}
