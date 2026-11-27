import { Suspense } from "react";
import Link from "next/link";
import { LandingSections } from "@/components/landing";
import { RotatingText, SectionDots } from "@/components/motion";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { formatAmount } from "@/lib/documents";
import { loadAccounting, openPayables, todayInIsrael } from "@/lib/accounting";
import { addDays } from "@/lib/campaigns";
import { loadInitiatives, type Initiative } from "@/lib/initiatives";
import Loading from "./loading";

type Task = { href: string; text: string; urgent?: boolean };
type Area = {
  href: string;
  title: string;
  /** File name of the small 3D picture in public/icons/3d. */
  icon: string;
  figures: { label: string; value: string }[];
  tasks: Task[];
  action: { href: string; label: string };
};

// The home screen has no folder of its own for a loading file, so its boundary is here:
// without one, coming back to it from another screen would wait with nothing shown.
export default function HomePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Hub />
    </Suspense>
  );
}

const INITIATIVE_LOOK: Record<Initiative["kind"], { label: string; glyph: string; tone: string }> = {
  reorder: { label: "מלאי", glyph: "↓", tone: "var(--tone-a)" },
  promotion: { label: "קמפיינים", glyph: "✦", tone: "var(--tone-b)" },
  accountant: { label: "ראיית חשבון", glyph: "₪", tone: "var(--tone-c)" },
};

/** The hub: what the system started on its own, then one card per area with what is waiting in it. */
async function Hub() {
  const { active } = await requireBusiness();
  const supabase = await createClient();
  const today = todayInIsrael();
  const business = active.businessId;
  const head = { count: "exact", head: true } as const;
  const seesMoney = can(active.role, "accounting.view");

  const shortage = (state: string) =>
    supabase.rpc("stock_overview", { p_business_id: business }, head).eq("state", state);
  const [stockOut, stockLow, stockNegative] = await Promise.all([shortage("out"), shortage("low"), shortage("negative")]);

  const [products, review, approved, tillProblems, unmatched, activeCampaigns, postsWaiting, postsLate, accounting] = await Promise.all([
    supabase.from("products").select("id", head).eq("business_id", business),
    supabase.from("documents").select("id", head).eq("business_id", business).in("status", ["review", "failed"]),
    supabase.from("documents").select("id, pos_exports (id)").eq("business_id", business).eq("status", "approved").limit(500),
    supabase.from("pos_exports").select("id", head).eq("business_id", business).is("confirmed_at", null).not("problem_at", "is", null),
    supabase.from("sales_lines").select("id", head).eq("business_id", business).is("applied_at", null),
    supabase.from("campaigns").select("id", head).eq("business_id", business).lte("starts_on", today).gte("ends_on", today),
    supabase.from("campaign_posts").select("id", head).eq("business_id", business).is("published_at", null).gte("scheduled_for", today).lte("scheduled_for", addDays(today, 7)),
    supabase.from("campaign_posts").select("id", head).eq("business_id", business).is("published_at", null).lt("scheduled_for", today),
    seesMoney ? loadAccounting(supabase, business) : null,
  ]);
  const failed = [products, review, approved, tillProblems, unmatched, activeCampaigns, postsWaiting, postsLate, stockOut, stockLow, stockNegative].find((result) => result.error);
  if (failed?.error) {
    throw new Error(`Failed to load the home screen: ${failed.error.message}`);
  }
  const initiatives = await loadInitiatives(supabase, business, today, accounting);
  const withoutFile = (approved.data ?? []).filter((document) => document.pos_exports.length === 0).length;
  const plural = (count: number, one: string, many: string) => (count === 1 ? one : `${count} ${many}`);

  const stockTasks: Task[] = [
    review.count ? { href: "/receiving", text: plural(review.count, "מסמך אחד מחכה לבדיקה ולאישור", "מסמכים מחכים לבדיקה ולאישור") } : null,
    withoutFile ? { href: "/exports", text: plural(withoutFile, "קליטה אחת עוד בלי קובץ לקופה", "קליטות עוד בלי קובץ לקופה") } : null,
    tillProblems.count ? { href: "/exports", text: plural(tillProblems.count, "קובץ אחד שהקופה לא קיבלה", "קבצים שהקופה לא קיבלה"), urgent: true } : null,
    unmatched.count ? { href: "/sales", text: plural(unmatched.count, "שורת מכירה אחת שלא זוהתה בקטלוג", "שורות מכירה שלא זוהו בקטלוג"), urgent: true } : null,
    stockNegative.count ? { href: "/reports/stock", text: plural(stockNegative.count, "פריט אחד שהמלאי שלו במינוס", "פריטים שהמלאי שלהם במינוס"), urgent: true } : null,
    stockOut.count ? { href: "/reports/stock", text: plural(stockOut.count, "פריט אחד אזל מהמלאי", "פריטים אזלו מהמלאי") } : null,
    stockLow.count ? { href: "/reports/stock", text: plural(stockLow.count, "פריט אחד מתחת לסף החוסר", "פריטים מתחת לסף החוסר") } : null,
  ].filter((task) => task !== null);

  const campaignTasks: Task[] = [
    postsLate.count ? { href: "/campaigns", text: plural(postsLate.count, "פוסט אחד שהתאריך שלו עבר ולא פורסם", "פוסטים שהתאריך שלהם עבר ולא פורסמו"), urgent: true } : null,
    postsWaiting.count ? { href: "/campaigns", text: plural(postsWaiting.count, "פוסט אחד לפרסום בשבוע הקרוב", "פוסטים לפרסום בשבוע הקרוב") } : null,
  ].filter((task) => task !== null);

  const areas: Area[] = [
    {
      href: "/products",
      title: "מלאי",
      icon: "package",
      figures: [{ label: "מוצרים בקטלוג", value: String(products.count ?? 0) }],
      tasks: stockTasks,
      action: { href: "/receiving/new", label: "קליטת סחורה" },
    },
    {
      href: "/campaigns",
      title: "קמפיינים",
      icon: "megaphone",
      figures: [{ label: "קמפיינים פעילים עכשיו", value: String(activeCampaigns.count ?? 0) }],
      tasks: campaignTasks,
      action: { href: "/campaigns", label: "לקמפיינים" },
    },
  ];
  if (accounting) {
    const open = openPayables(accounting.purchases, accounting.expenses, today);
    areas.push({
      href: "/accounting",
      title: "ראיית חשבון",
      icon: "receipt",
      figures: [{ label: "פתוח לתשלום", value: `${formatAmount(open.total, 0)} ₪` }],
      tasks: [
        open.overdue ? { href: "/accounting", text: plural(open.overdue, "תשלום אחד באיחור", "תשלומים באיחור"), urgent: true } : null,
        open.count ? { href: "/accounting", text: plural(open.count, "מסמך אחד שעוד לא שולם", "מסמכים שעוד לא שולמו") } : null,
      ].filter((task) => task !== null),
      action: { href: "/accounting", label: "לראיית החשבון" },
    });
  }

  const waiting = areas.reduce((total, area) => total + area.tasks.length, 0);

  return (
    <div className="flex flex-col gap-12">
      <section className="bleed hero frame-row -mt-8 py-12 text-center sm:-mt-10 sm:py-16" data-fx suppressHydrationWarning>
        <div className="fx-hero"><div className="hero-in">
        <span className="pill">
          <bdi>{active.businessName}</bdi>
          <span aria-hidden="true">·</span>
          {ROLE_LABELS[active.role]}
        </span>
        <h1 className="hero-title mx-auto mt-5 max-w-3xl">
          עסק שמפעיל את עצמו.
          <br />
          <RotatingText phrases={["מזמין מה שחסר.", "יוזם מבצעים.", "סוגר את החודש.", "אתם רק מאשרים."]} />
        </h1>
        <p className="lede mx-auto mt-6 max-w-xl">
          {initiatives.length > 0
            ? `המערכת הכינה ${initiatives.length === 1 ? "יוזמה אחת" : `${initiatives.length} יוזמות`}. נשאר לכם לבדוק ולאשר.`
            : waiting === 0
              ? "אין כרגע דבר שמחכה לטיפול."
              : "זה מה שמחכה לטיפול היום."}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {initiatives.length > 0 ? (
            <>
              <a href="#initiatives" className="btn btn-lg">
                ליוזמות שמחכות לאישור
              </a>
              <Link href="/receiving/new" className="btn-quiet btn-lg">
                קליטת סחורה
              </Link>
            </>
          ) : (
            <>
              <Link href="/receiving/new" className="btn btn-lg">
                קליטת סחורה
              </Link>
              <Link href="/campaigns" className="btn-quiet btn-lg">
                קמפיינים
              </Link>
            </>
          )}
        </div>
        </div></div>
      </section>

      <section id="initiatives" className="scroll-mt-28" aria-labelledby="initiatives-heading">
        <p className="eyebrow">המערכת יזמה</p>
        <h2 id="initiatives-heading" className="mt-2 text-3xl">
          {initiatives.length > 0 ? "מוכן לאישור שלכם" : "אין כרגע יוזמה חדשה"}
        </h2>
        {initiatives.length === 0 ? (
          <p className="mt-3 max-w-prose text-sm text-muted">
            בכל כניסה המערכת בודקת שלושה דברים: פריטים שירדו מתחת לסף המלאי, מוצרים שנמצאים במלאי ולא נמכרו 30 יום, וחודש
            שנסגר ומחכה לרואה החשבון. כשאחד מהם קורה, הצעד הבא יופיע כאן מוכן.
          </p>
        ) : (
          <ul className={`mt-6 grid gap-3 ${initiatives.length >= 3 ? "lg:grid-cols-3" : "sm:grid-cols-2"}`}>
            {initiatives.map((initiative) => {
              const look = INITIATIVE_LOOK[initiative.kind];
              return (
                <li key={initiative.href} className="card reveal flex flex-col gap-3" suppressHydrationWarning>
                  <p className="flex items-center gap-2 text-sm text-muted">
                    <span className="glyph" style={{ "--glyph": look.tone } as React.CSSProperties} aria-hidden="true">
                      {look.glyph}
                    </span>
                    {look.label}
                  </p>
                  <h3 className="display text-xl">
                    <bdi>{initiative.title}</bdi>
                  </h3>
                  <p className="text-sm leading-relaxed text-muted">
                    <bdi>{initiative.reason}</bdi>
                  </p>
                  <Link href={initiative.href} className="btn mt-auto self-start">
                    {initiative.action}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-4 text-xs text-muted">המערכת מכינה ומציעה. שום דבר לא נשלח, לא מתפרסם ולא מוזמן בלי האישור שלכם.</p>
      </section>

      <section aria-labelledby="areas-heading">
        <p className="eyebrow">העסק שלכם</p>
        <h2 id="areas-heading" className="mt-2 text-3xl">
          מה מחכה לטיפול
        </h2>
        <div className={`mt-6 grid gap-3 ${areas.length === 3 ? "lg:grid-cols-3" : "sm:grid-cols-2"}`}>
          {areas.map((area) => (
            <section key={area.href} className="card reveal flex flex-col gap-4" suppressHydrationWarning aria-labelledby={`area-${area.href.slice(1)}`}>
              <div className="flex items-center justify-between gap-3">
                <h3 id={`area-${area.href.slice(1)}`} className="eyebrow">
                  <Link href={area.href} className="hover:text-accent">{area.title}</Link>
                </h3>
                {/* eslint-disable-next-line @next/next/no-img-element -- a 4 KB decorative picture, already sized */}
                <img src={`/icons/3d/${area.icon}.webp`} alt="" width={44} height={44} className="icon-3d" />
              </div>
              {area.figures.map((figure) => (
                <p key={figure.label}>
                  <bdi dir="ltr" className="display block text-5xl tabular-nums">{figure.value}</bdi>
                  <span className="mt-1 block text-sm text-muted">{figure.label}</span>
                </p>
              ))}
              {area.tasks.length === 0 ? (
                <p className="text-sm text-muted">הכול מטופל.</p>
              ) : (
                <ul className="flex flex-col gap-1.5 text-sm">
                  {area.tasks.map((task) => (
                    <li key={task.text}>
                      <Link href={task.href} className={`flex min-h-11 items-center rounded-lg px-3 hover:underline ${task.urgent ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"}`}>
                        {task.text}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <Link href={area.action.href} className="btn-quiet mt-auto self-start">
                {area.action.label}
              </Link>
            </section>
          ))}
        </div>
      </section>

      <div className="-mb-8 sm:-mb-10">
        <LandingSections cta={{ href: "/receiving/new", label: "קליטת סחורה" }} />
      </div>
      <SectionDots />
    </div>
  );
}
