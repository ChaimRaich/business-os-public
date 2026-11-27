import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CopyText } from "@/components/copy-text";
import { formatQuantity, isStockState, STOCK_STATE_LABELS, STOCK_STATE_STYLES } from "@/lib/stock";

export const metadata: Metadata = { title: "טיוטת הזמנה לספק" };

/**
 * A suggestion only: enough to get back above the threshold, plus what sold in the
 * last 30 days. The user edits the draft before sending it.
 */
const suggest = (quantity: number, threshold: number | null, sold: number) =>
  Math.max(1, Math.ceil((threshold ?? 0) + Math.max(sold, 0) - quantity));

export default async function SupplierOrderPage({ params }: PageProps<"/reports/stock/order/[supplierId]">) {
  const { supplierId } = await params;
  const { active } = await requireBusiness();
  const supabase = await createClient();
  const [{ data: supplier }, { data: rows, error }] = await Promise.all([
    supabase.from("suppliers").select("id, name, phone").eq("id", supplierId).eq("business_id", active.businessId).maybeSingle(),
    supabase
      .rpc("stock_overview", { p_business_id: active.businessId })
      .eq("supplier_id", supplierId)
      .neq("state", "ok")
      .order("product_name")
      .limit(300),
  ]);
  if (!supplier) {
    notFound();
  }
  if (error) {
    throw new Error(`Failed to load the order draft: ${error.message}`);
  }
  const items = rows ?? [];
  const { data: codes } = items.length
    ? await supabase
        .from("variant_codes")
        .select("variant_id, code")
        .eq("kind", "supplier_sku")
        .eq("supplier_id", supplierId)
        .in("variant_id", items.map((item) => item.variant_id))
    : { data: [] };
  const skuOf = new Map((codes ?? []).map((code) => [code.variant_id, code.code]));

  const lines = items.map((item) => {
    const name = [item.product_name, item.variant_label].filter(Boolean).join(" · ");
    const sku = skuOf.get(item.variant_id);
    return `• ${name}${sku ? ` (מק״ט ${sku})` : ""}: ${suggest(item.quantity, item.threshold, item.sold_30_days)} יח׳`;
  });
  const draft = [`שלום, הזמנה מ${active.businessName}:`, "", ...lines, "", "תודה"].join("\n");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/reports/stock" className="text-sm text-muted underline-offset-4 hover:underline">
          → חוסרים
        </Link>
        <h1 className="mt-1 text-3xl sm:text-4xl">טיוטת הזמנה: {supplier.name}</h1>
        <p className="mt-1 max-w-prose text-sm text-muted">
          המערכת לא שולחת את ההזמנה לבד: עורכים את הטיוטה ופותחים אותה בוואטסאפ או במייל.
        </p>
      </div>

      {items.length === 0 ? (
        <section className="card">
          <p className="text-sm text-muted">אין כרגע חוסרים אצל הספק הזה.</p>
        </section>
      ) : (
        <>
          <section className="card">
            <h2 className="font-semibold">הפריטים ({items.length})</h2>
            <ul className="mt-2 divide-y divide-line text-sm">
              {items.map((item) => (
                <li key={item.variant_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                  <span className="min-w-0 flex-1 basis-56">
                    <Link href={`/products/${item.product_id}`} className="font-medium underline-offset-4 hover:underline">
                      {[item.product_name, item.variant_label].filter(Boolean).join(" · ")}
                    </Link>
                    <span className="block text-muted">
                      {skuOf.get(item.variant_id) ? <>מק״ט ספק <bdi dir="ltr" className="font-mono">{skuOf.get(item.variant_id)}</bdi></> : "בלי מק״ט ספק"}
                      {item.sold_30_days > 0 && ` · נמכרו ${formatQuantity(item.sold_30_days)} ב-30 יום`}
                    </span>
                  </span>
                  <span className={`rounded-full px-3 py-1 ${STOCK_STATE_STYLES[isStockState(item.state) ? item.state : "ok"]}`}>
                    {STOCK_STATE_LABELS[isStockState(item.state) ? item.state : "ok"]} · במלאי <bdi dir="ltr">{formatQuantity(item.quantity)}</bdi>
                  </span>
                  <span className="text-muted">הצעה: {suggest(item.quantity, item.threshold, item.sold_30_days)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-line pt-3 text-sm text-muted">
              ההצעה: מה שחסר עד הסף ועוד מה שנמכר ב-30 הימים האחרונים.
            </p>
          </section>

          <section className="card">
            <CopyText
              id="order-draft"
              label="הטיוטה (אפשר לערוך)"
              text={draft}
              rows={Math.min(18, lines.length + 5)}
              send={{ phone: supplier.phone, subject: `הזמנה מ${active.businessName}` }}
            />
            {supplier.phone && (
              <p className="mt-3 text-sm text-muted">
                טלפון הספק: <bdi dir="ltr">{supplier.phone}</bdi>
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
