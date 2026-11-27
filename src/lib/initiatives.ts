import type { createClient } from "@/lib/supabase/server";
import { addDays } from "@/lib/campaigns";
import { inPeriod, parsePeriod, type Expense, type Purchase } from "@/lib/accounting";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Things the system starts on its own. It reads the stock, the sales and the calendar,
 * prepares the next step, and leaves the decision to a person: nothing here sends,
 * publishes or orders anything.
 */
export type Initiative = {
  kind: "reorder" | "promotion" | "accountant";
  title: string;
  /** What the system saw that made it start this. */
  reason: string;
  href: string;
  action: string;
};

/** A product counts as stuck when it is in stock, sold nothing in this many days, and arrived before that. */
export const SLOW_DAYS = 30;
/** The month-end reminder for the accountant shows until this day of the next month. */
const ACCOUNTANT_UNTIL_DAY = 15;
const MAX_REORDERS = 3;

type StockRow = {
  variant_id: string;
  product_id: string;
  product_name: string;
  supplier_id: string | null;
  supplier_name: string | null;
  quantity: number;
  state: string;
  sold_30_days: number;
};

const plural = (count: number, one: string, many: string) => (count === 1 ? one : `${count} ${many}`);

function reorders(rows: StockRow[]): Initiative[] {
  const bySupplier = new Map<string, { name: string; missing: number; out: number }>();
  for (const row of rows) {
    if (row.state === "ok" || !row.supplier_id) continue;
    const entry = bySupplier.get(row.supplier_id) ?? { name: row.supplier_name ?? "ספק", missing: 0, out: 0 };
    entry.missing += 1;
    if (row.state !== "low") entry.out += 1;
    bySupplier.set(row.supplier_id, entry);
  }
  return [...bySupplier.entries()]
    .sort(([, a], [, b]) => b.out - a.out || b.missing - a.missing)
    .slice(0, MAX_REORDERS)
    .map(([supplierId, supplier]) => ({
      kind: "reorder" as const,
      title: `הכנתי הזמנה ל${supplier.name}`,
      reason:
        plural(supplier.missing, "פריט אחד של הספק ירד מתחת לסף", "פריטים של הספק ירדו מתחת לסף") +
        (supplier.out ? `, מתוכם ${plural(supplier.out, "אחד אזל", "אזלו")}.` : "."),
      href: `/reports/stock/order/${supplierId}`,
      action: "לבדיקה ולשליחה לספק",
    }));
}

/** Products in stock that sold nothing lately. Empty when the business has no recent sales to judge by. */
export async function slowProducts(supabase: Supabase, businessId: string, today: string, rows?: StockRow[]): Promise<string[]> {
  const stock = rows ?? (await loadStock(supabase, businessId));
  // Without imported sales every product looks stuck, so there is nothing to conclude.
  if (!stock.some((row) => row.sold_30_days > 0)) {
    return [];
  }
  const candidates = stock.filter((row) => row.quantity > 0 && row.sold_30_days <= 0);
  if (candidates.length === 0) {
    return [];
  }
  // Only what has been on the shelf long enough: something received last week is not stuck yet.
  const { data: old } = await supabase
    .from("stock_movements")
    .select("variant_id")
    .eq("business_id", businessId)
    .lt("created_at", `${addDays(today, -SLOW_DAYS)}T00:00:00Z`)
    .in("variant_id", candidates.slice(0, 300).map((row) => row.variant_id))
    .limit(2000);
  const onShelf = new Set((old ?? []).map((movement) => movement.variant_id));
  const products = new Map<string, { name: string; quantity: number }>();
  for (const row of candidates) {
    if (!onShelf.has(row.variant_id)) continue;
    const entry = products.get(row.product_id) ?? { name: row.product_name, quantity: 0 };
    entry.quantity += Number(row.quantity);
    products.set(row.product_id, entry);
  }
  return [...products.values()].sort((a, b) => b.quantity - a.quantity).map((product) => product.name);
}

/** The ready-to-edit campaign the promotion initiative opens. */
export function promotionDraft(names: string[], today: string) {
  const shown = names.slice(0, 5).join(", ");
  return {
    name: "מבצע על מלאי שלא זז",
    goal: `להזיז מוצרים שלא נמכרו ב-${SLOW_DAYS} הימים האחרונים: ${shown}${names.length > 5 ? ` ועוד ${names.length - 5}` : ""}.`.slice(0, 500),
    starts_on: today,
    ends_on: addDays(today, 14),
  };
}

function accountant(today: string, accounting: { purchases: Purchase[]; expenses: Expense[] } | null): Initiative[] {
  if (!accounting || Number(today.slice(8, 10)) > ACCOUNTANT_UNTIL_DAY) {
    return [];
  }
  const lastMonth = addDays(`${today.slice(0, 8)}01`, -1);
  const period = parsePeriod(lastMonth.slice(0, 7), today);
  const documents =
    accounting.purchases.filter((item) => inPeriod(item.date, period)).length +
    accounting.expenses.filter((item) => inPeriod(item.date, period)).length;
  if (documents === 0) {
    return [];
  }
  return [
    {
      kind: "accountant",
      title: `החומר של ${period.label} מוכן לרואה החשבון`,
      reason: `החודש נסגר. ריכזתי ${plural(documents, "מסמך אחד", "מסמכים")} של קניות והוצאות לקובץ אחד.`,
      href: `/accounting?period=${period.key}`,
      action: "לבדיקה ולהורדת הקובץ",
    },
  ];
}

async function loadStock(supabase: Supabase, businessId: string): Promise<StockRow[]> {
  const { data, error } = await supabase
    .rpc("stock_overview", { p_business_id: businessId })
    .select("variant_id, product_id, product_name, supplier_id, supplier_name, quantity, state, sold_30_days")
    .limit(2000);
  if (error) {
    throw new Error(`Failed to load stock for initiatives: ${error.message}`);
  }
  return data ?? [];
}

export async function loadInitiatives(
  supabase: Supabase,
  businessId: string,
  today: string,
  accounting: { purchases: Purchase[]; expenses: Expense[] } | null,
): Promise<Initiative[]> {
  const stock = await loadStock(supabase, businessId);
  const slow = await slowProducts(supabase, businessId, today, stock);
  const promotion: Initiative[] = slow.length
    ? [
        {
          kind: "promotion",
          title: "הכנתי מבצע למלאי שלא זז",
          reason: `${plural(slow.length, "מוצר אחד נמצא במלאי ולא נמכר", "מוצרים נמצאים במלאי ולא נמכרו")} ב-${SLOW_DAYS} הימים האחרונים. הראשון: ${slow[0]}.`,
          href: "/campaigns?draft=slow#new-campaign",
          action: "לבדיקה ולפתיחת הקמפיין",
        },
      ]
    : [];
  return [...reorders(stock), ...promotion, ...accountant(today, accounting)];
}
