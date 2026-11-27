import "server-only";
import { loadAccounting, openPayables, todayInIsrael } from "@/lib/accounting";
import { addDays } from "@/lib/campaigns";
import type { ChannelId } from "@/lib/assistant-channels";
import { loadInitiatives } from "@/lib/initiatives";
import { formatQuantity } from "@/lib/stock";
import { formatCurrency } from "@/lib/suite";
import { createClient } from "@/lib/supabase/server";

export type Finding = {
  href: string;
  text: string;
  urgent?: boolean;
  /** A plain fact, not something to handle: shown on the card but not counted as waiting. */
  info?: boolean;
};

/** What one worker has on the desk right now, read from the business data. */
export type Desk = {
  figure: { value: string; label: string };
  findings: Finding[];
  /** The screen where this worker's area is handled. */
  href: string;
};

const plural = (count: number, one: string, many: string) => (count === 1 ? one : `${count} ${many}`);
const SALES_DAYS = 30;
/** Sales older than this are worth a reminder to import the next report. */
const STALE_SALES_DAYS = 7;

/**
 * Every worker's desk, read with the signed-in user's session, so Row Level Security
 * keeps it to the active business. The money desk is left out for staff.
 */
export async function loadDesks(businessId: string, seesMoney: boolean): Promise<Partial<Record<ChannelId, Desk>>> {
  const supabase = await createClient();
  const today = todayInIsrael();
  const head = { count: "exact", head: true } as const;
  const shortage = (state: string) => supabase.rpc("stock_overview", { p_business_id: businessId }, head).eq("state", state);

  const [
    stockNegative,
    stockOut,
    stockLow,
    products,
    review,
    failed,
    tillProblems,
    suppliers,
    salesReport,
    unmatched,
    lastImport,
    activeCampaigns,
    postsWaiting,
    postsLate,
    activeAds,
    customers,
    leads,
    vips,
    ledgerOverdue,
    accounting,
  ] = await Promise.all([
    shortage("negative"),
    shortage("out"),
    shortage("low"),
    supabase.from("products").select("id", head).eq("business_id", businessId),
    supabase.from("documents").select("id", head).eq("business_id", businessId).eq("status", "review"),
    supabase.from("documents").select("id", head).eq("business_id", businessId).eq("status", "failed"),
    supabase.from("pos_exports").select("id", head).eq("business_id", businessId).is("confirmed_at", null).not("problem_at", "is", null),
    supabase.from("suppliers").select("id", head).eq("business_id", businessId),
    supabase.rpc("sales_report", { p_business_id: businessId, p_from: addDays(today, -(SALES_DAYS - 1)), p_to: today }).limit(1000),
    supabase.from("sales_lines").select("id", head).eq("business_id", businessId).is("applied_at", null),
    supabase.from("sales_imports").select("created_at").eq("business_id", businessId).is("reverted_at", null).order("created_at", { ascending: false }).limit(1),
    supabase.from("campaigns").select("id", head).eq("business_id", businessId).lte("starts_on", today).gte("ends_on", today),
    supabase.from("campaign_posts").select("id", head).eq("business_id", businessId).is("published_at", null).gte("scheduled_for", today).lte("scheduled_for", addDays(today, 7)),
    supabase.from("campaign_posts").select("id", head).eq("business_id", businessId).is("published_at", null).lt("scheduled_for", today),
    supabase.from("ad_campaigns").select("id", head).eq("business_id", businessId).eq("status", "active"),
    supabase.from("customers").select("id", head).eq("business_id", businessId),
    supabase.from("customers").select("id", head).eq("business_id", businessId).eq("stage", "lead"),
    supabase.from("customers").select("id", head).eq("business_id", businessId).eq("stage", "vip"),
    supabase.from("ledger_entries").select("id", head).eq("business_id", businessId).eq("status", "overdue"),
    seesMoney ? loadAccounting(supabase, businessId) : null,
  ]);
  const failedQuery = [stockNegative, stockOut, stockLow, products, review, failed, tillProblems, suppliers, salesReport, unmatched, lastImport, activeCampaigns, postsWaiting, postsLate, activeAds, customers, leads, vips, ledgerOverdue].find((result) => result.error);
  if (failedQuery?.error) {
    throw new Error(`Failed to load the workers' desks: ${failedQuery.error.message}`);
  }
  const n = (result: { count: number | null }) => result.count ?? 0;
  const keep = (findings: (Finding | null | false)[]) => findings.filter((finding): finding is Finding => Boolean(finding));

  const shortages = n(stockNegative) + n(stockOut) + n(stockLow);
  const inventory: Desk = {
    href: "/reports/stock",
    figure: { value: String(shortages), label: shortages === 1 ? "פריט בחוסר" : "פריטים בחוסר" },
    findings: keep([
      n(stockNegative) > 0 && { href: "/reports/stock", text: plural(n(stockNegative), "פריט אחד במינוס", "פריטים במינוס"), urgent: true },
      n(stockOut) > 0 && { href: "/reports/stock", text: plural(n(stockOut), "פריט אחד אזל", "פריטים אזלו") },
      n(stockLow) > 0 && { href: "/reports/stock", text: plural(n(stockLow), "פריט אחד מתחת לסף", "פריטים מתחת לסף") },
      n(products) === 0 && { href: "/receiving/new", text: "הקטלוג ריק. מתחילים בקליטת סחורה" },
    ]),
  };

  const receiving: Desk = {
    href: "/receiving",
    figure: { value: String(n(review)), label: "מסמכים מחכים לבדיקה" },
    findings: keep([
      n(failed) > 0 && { href: "/receiving", text: plural(n(failed), "מסמך אחד שלא הצלחתי לקרוא", "מסמכים שלא הצלחתי לקרוא"), urgent: true },
      n(tillProblems) > 0 && { href: "/exports", text: plural(n(tillProblems), "קובץ אחד שהקופה לא קיבלה", "קבצים שהקופה לא קיבלה"), urgent: true },
      n(review) > 0 && { href: "/receiving", text: plural(n(review), "מסמך אחד מחכה לאישור שלכם", "מסמכים מחכים לאישור שלכם") },
      { href: "/suppliers", text: n(suppliers) === 1 ? "ספק אחד רשום" : `${n(suppliers)} ספקים רשומים`, info: true },
    ]),
  };

  const sold = (salesReport.data ?? []).reduce((total, item) => total + Number(item.units_sold), 0);
  const lastImportAt = lastImport.data?.[0]?.created_at.slice(0, 10) ?? null;
  const sales: Desk = {
    href: "/reports/sales",
    figure: { value: formatQuantity(sold), label: `יחידות נמכרו ב-${SALES_DAYS} יום` },
    findings: keep([
      n(unmatched) > 0 && { href: "/sales", text: plural(n(unmatched), "שורת מכירה אחת שלא זיהיתי בקטלוג", "שורות מכירה שלא זיהיתי בקטלוג"), urgent: true },
      lastImportAt === null
        ? { href: "/sales/import", text: "עוד לא יובא דוח מכירות" }
        : lastImportAt < addDays(today, -STALE_SALES_DAYS) && { href: "/sales/import", text: `הדוח האחרון יובא ב-${lastImportAt.split("-").reverse().join("/")}` },
    ]),
  };

  const marketing: Desk = {
    href: "/campaigns",
    figure: { value: String(n(activeCampaigns)), label: "קמפיינים פעילים" },
    findings: keep([
      n(postsLate) > 0 && { href: "/campaigns", text: plural(n(postsLate), "פוסט אחד שהתאריך שלו עבר", "פוסטים שהתאריך שלהם עבר"), urgent: true },
      n(postsWaiting) > 0 && { href: "/campaigns", text: plural(n(postsWaiting), "פוסט אחד לפרסום השבוע", "פוסטים לפרסום השבוע") },
      n(activeAds) > 0 && { href: "/ads", text: plural(n(activeAds), "קמפיין ממומן אחד רץ", "קמפיינים ממומנים רצים"), info: true },
    ]),
  };

  const customersDesk: Desk = {
    href: "/crm",
    figure: { value: String(n(customers)), label: "לקוחות ולידים" },
    findings: keep([
      n(leads) > 0 && { href: "/crm", text: plural(n(leads), "ליד חדש אחד מחכה למעקב", "לידים חדשים מחכים למעקב") },
      n(vips) > 0 && { href: "/crm", text: plural(n(vips), "לקוח אחד במועדון VIP", "לקוחות במועדון VIP"), info: true },
    ]),
  };

  const desks: Partial<Record<ChannelId, Desk>> = { inventory, receiving, sales, marketing, customers: customersDesk };

  if (accounting) {
    const open = openPayables(accounting.purchases, accounting.expenses, today);
    desks.money = {
      href: "/accounting",
      figure: { value: formatCurrency(open.total), label: "פתוח לתשלום" },
      findings: keep([
        open.overdue > 0 && { href: "/accounting", text: plural(open.overdue, "תשלום אחד לספק באיחור", "תשלומים לספקים באיחור"), urgent: true },
        n(ledgerOverdue) > 0 && { href: "/finance", text: plural(n(ledgerOverdue), "רשומה אחת ביומן הכספים באיחור", "רשומות ביומן הכספים באיחור"), urgent: true },
        open.count > 0 && { href: "/accounting", text: plural(open.count, "מסמך אחד שעוד לא שולם", "מסמכים שעוד לא שולמו") },
      ]),
    };
  }

  // The work manager gathers what the team found, the urgent first, plus what the system prepared.
  const initiatives = await loadInitiatives(supabase, businessId, today, accounting);
  const team = Object.values(desks).flatMap((desk) => desk.findings.filter((finding) => !finding.info));
  const urgent = team.filter((finding) => finding.urgent);
  desks.main = {
    href: "/",
    figure: { value: String(team.length + initiatives.length), label: "דברים מחכים לכם" },
    findings: [
      ...urgent,
      ...initiatives.map((initiative) => ({ href: initiative.href, text: initiative.title })),
      ...team.filter((finding) => !finding.urgent),
    ].slice(0, 5),
  };
  return desks;
}
