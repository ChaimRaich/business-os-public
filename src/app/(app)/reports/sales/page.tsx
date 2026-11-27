import type { Metadata } from "next";
import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatAmount } from "@/lib/documents";
import { formatDay, isIsoDate, todayInIsrael } from "@/lib/accounting";
import { addDays } from "@/lib/campaigns";
import { formatQuantity } from "@/lib/stock";

export const metadata: Metadata = { title: "דוח מכירות" };

const PRESETS = [
  { days: 7, label: "7 ימים" },
  { days: 30, label: "30 ימים" },
  { days: 90, label: "90 ימים" },
];
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

type Row = { key: string; href: string | null; title: string; note: string; sold: number; returned: number; till: number; web: number; amount: number; priced: boolean };

export default async function SalesReportPage({ searchParams }: PageProps<"/reports/sales">) {
  const params = await searchParams;
  // The signed-in user is read first: "today" is only known at request time, and
  // Next.js refuses to read the clock while it prepares the static part of the page.
  const { active } = await requireBusiness();
  const today = todayInIsrael();
  const to = isIsoDate(first(params.to)) ? first(params.to) : today;
  const wantedFrom = isIsoDate(first(params.from)) ? first(params.from) : addDays(to, -29);
  const from = wantedFrom > to ? to : wantedFrom;
  const bySupplier = first(params.by) === "supplier";

  const supabase = await createClient();
  const [report, waiting] = await Promise.all([
    supabase.rpc("sales_report", { p_business_id: active.businessId, p_from: from, p_to: to }).limit(1000),
    supabase
      .from("sales_lines")
      .select("id", { count: "exact", head: true })
      .eq("business_id", active.businessId)
      .is("applied_at", null),
  ]);
  if (report.error || waiting.error) {
    throw new Error(`Failed to load the sales report: ${(report.error ?? waiting.error)?.message}`);
  }
  const items = report.data ?? [];

  const groups = new Map<string, Row>();
  for (const item of items) {
    const key = bySupplier ? (item.supplier_id ?? "none") : item.variant_id;
    const row = groups.get(key) ?? {
      key,
      href: bySupplier ? (item.supplier_id ? `/suppliers/${item.supplier_id}` : null) : `/products/${item.product_id}`,
      title: bySupplier ? (item.supplier_name ?? "ללא ספק") : [item.product_name, item.variant_label].filter(Boolean).join(" · "),
      note: bySupplier ? "" : (item.supplier_name ?? "ללא ספק"),
      sold: 0, returned: 0, till: 0, web: 0, amount: 0, priced: true,
    };
    row.sold += item.units_sold;
    row.returned += item.units_returned;
    row.till += item.till_units;
    row.web += item.web_units;
    row.amount += item.amount;
    row.priced &&= item.priced;
    groups.set(key, row);
  }
  const rows = [...groups.values()].sort((a, b) => b.sold - b.returned - (a.sold - a.returned) || b.amount - a.amount);
  if (bySupplier) {
    const counts = new Map<string, number>();
    for (const item of items) {
      const key = item.supplier_id ?? "none";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const row of rows) {
      const count = counts.get(row.key) ?? 0;
      row.note = count === 1 ? "פריט אחד" : `${count} פריטים שונים`;
    }
  }
  const total = rows.reduce(
    (sum, row) => ({ sold: sum.sold + row.sold, returned: sum.returned + row.returned, web: sum.web + row.web, amount: sum.amount + row.amount }),
    { sold: 0, returned: 0, web: 0, amount: 0 },
  );
  const hasWeb = total.web !== 0;
  const link = (next: { from?: string; to?: string; by?: string }) => {
    const query = new URLSearchParams({ from: next.from ?? from, to: next.to ?? to });
    if ((next.by ?? (bySupplier ? "supplier" : "product")) === "supplier") query.set("by", "supplier");
    return `/reports/sales?${query}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl sm:text-4xl">דוח מכירות</h1>
      </div>

      <section className="card">
        <form action="/reports/sales" className="flex flex-wrap items-end gap-3">
          {bySupplier && <input type="hidden" name="by" value="supplier" />}
          <div>
            <label className="label" htmlFor="from">מתאריך</label>
            <input className="field" id="from" name="from" type="date" defaultValue={from} max={today} required />
          </div>
          <div>
            <label className="label" htmlFor="to">עד תאריך</label>
            <input className="field" id="to" name="to" type="date" defaultValue={to} max={today} required />
          </div>
          <button type="submit" className="btn-quiet">הצגה</button>
          <nav aria-label="תקופות מוכנות" className="flex flex-wrap gap-1 text-sm">
            {PRESETS.map((preset) => {
              const start = addDays(today, -(preset.days - 1));
              const current = to === today && from === start;
              return (
                <Link
                  key={preset.days}
                  href={link({ from: start, to: today })}
                  aria-current={current ? "true" : undefined}
                  className={`flex min-h-11 items-center rounded-lg px-3 ${current ? "bg-accent-soft font-semibold text-accent-strong" : "hover:bg-canvas"}`}
                >
                  {preset.label}
                </Link>
              );
            })}
          </nav>
        </form>
        <nav aria-label="קיבוץ הדוח" className="mt-4 flex flex-wrap gap-1 border-t border-line pt-4 text-sm">
          {[
            { by: "product", label: "לפי מוצר" },
            { by: "supplier", label: "לפי ספק" },
          ].map((option) => {
            const current = (option.by === "supplier") === bySupplier;
            return (
              <Link
                key={option.by}
                href={link({ by: option.by })}
                aria-current={current ? "true" : undefined}
                className={`flex min-h-11 items-center rounded-lg px-3 ${current ? "bg-accent-soft font-semibold text-accent-strong" : "hover:bg-canvas"}`}
              >
                {option.label}
              </Link>
            );
          })}
        </nav>
      </section>

      {(waiting.count ?? 0) > 0 && (
        <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn" role="status">
          {waiting.count} שורות מכירה עוד לא זוהו בקטלוג ואינן כלולות בדוח.{" "}
          <Link href="/sales" className="font-medium underline underline-offset-4">
            לטיפול במסך המכירות
          </Link>
        </p>
      )}

      <section className="card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">
            {formatDay(from)} עד {formatDay(to)}
          </h2>
          <p className="text-sm text-muted">
            {formatQuantity(total.sold)} יחידות נמכרו
            {total.returned > 0 && ` · ${formatQuantity(total.returned)} הוחזרו`}
            {total.amount !== 0 && <> · <bdi dir="ltr">₪{formatAmount(total.amount, 0)}</bdi> לפי מחיר מחירון</>}
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            אין מכירות בתקופה.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th scope="col" className="px-2 py-2 text-start font-medium">{bySupplier ? "ספק" : "מוצר"}</th>
                  <th scope="col" className="px-2 py-2 text-end font-medium">נמכרו</th>
                  <th scope="col" className="px-2 py-2 text-end font-medium">הוחזרו</th>
                  {hasWeb && <th scope="col" className="px-2 py-2 text-end font-medium">מהן באתר</th>}
                  <th scope="col" className="px-2 py-2 text-end font-medium">סכום (מחירון)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => (
                  <tr key={row.key}>
                    <th scope="row" className="px-2 py-2.5 text-start font-normal">
                      {row.href ? (
                        <Link href={row.href} className="font-medium underline-offset-4 hover:underline">{row.title}</Link>
                      ) : (
                        <span className="font-medium">{row.title}</span>
                      )}
                      <span className="block text-muted">{row.note}</span>
                    </th>
                    <td className="px-2 py-2.5 text-end tabular-nums"><bdi dir="ltr">{formatQuantity(row.sold)}</bdi></td>
                    <td className="px-2 py-2.5 text-end tabular-nums text-muted"><bdi dir="ltr">{row.returned ? formatQuantity(row.returned) : "—"}</bdi></td>
                    {hasWeb && <td className="px-2 py-2.5 text-end tabular-nums text-muted"><bdi dir="ltr">{row.web ? formatQuantity(row.web) : "—"}</bdi></td>}
                    <td className="px-2 py-2.5 text-end tabular-nums">
                      <bdi dir="ltr">{row.amount !== 0 ? `₪${formatAmount(row.amount, 0)}` : "—"}</bdi>
                      {!row.priced && row.amount !== 0 && <span className="text-muted"> *</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 border-t border-line pt-3 text-sm text-muted">
          הסכום לפי מחיר מחירון, לא בהכרח מה ששולם. מכירות ״פריט כללי״ אינן כלולות.
          {rows.some((row) => !row.priced && row.amount !== 0) && " * לחלק מהמכירות לא היה מחיר, והסכום חלקי."}
          {items.length === 1000 && " הדוח מוגבל ל-1,000 פריטים; קצרו את התקופה כדי לראות הכול."}
        </p>
      </section>
    </div>
  );
}
