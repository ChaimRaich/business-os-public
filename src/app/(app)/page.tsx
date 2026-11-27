import { Suspense } from "react";
import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { formatAmount } from "@/lib/documents";
import { loadAccounting, openPayables, todayInIsrael } from "@/lib/accounting";
import { addDays } from "@/lib/campaigns";
import { loadInitiatives, SLOW_DAYS, type Initiative } from "@/lib/initiatives";
import Loading from "./loading";

type Task = { href: string; text: string; urgent?: boolean };
type Area = {
  href: string;
  title: string;
  /** File name of the small 3D picture in public/icons/3d. */
  icon: string;
  figure: { label: string; value: string };
  tasks: Task[];
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

const dayFormat = new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/**
 * The work desk. It answers one question, "what needs me now?": first what the system
 * prepared for approval, then what is waiting in each area, with the state of the business beside them.
 */
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
      figure: { label: "מוצרים בקטלוג", value: String(products.count ?? 0) },
      tasks: stockTasks,
    },
    {
      href: "/campaigns",
      title: "קמפיינים",
      icon: "megaphone",
      figure: { label: "קמפיינים פעילים עכשיו", value: String(activeCampaigns.count ?? 0) },
      tasks: campaignTasks,
    },
  ];
  if (accounting) {
    const open = openPayables(accounting.purchases, accounting.expenses, today);
    areas.push({
      href: "/accounting",
      title: "ראיית חשבון",
      icon: "receipt",
      figure: { label: "פתוח לתשלום", value: `${formatAmount(open.total, 0)} ₪` },
      tasks: [
        open.overdue ? { href: "/accounting", text: plural(open.overdue, "תשלום אחד באיחור", "תשלומים באיחור"), urgent: true } : null,
        open.count ? { href: "/accounting", text: plural(open.count, "מסמך אחד שעוד לא שולם", "מסמכים שעוד לא שולמו") } : null,
      ].filter((task) => task !== null),
    });
  }

  // One queue across the areas, the urgent ones first.
  const tasks = areas
    .flatMap((area) => area.tasks.map((task) => ({ ...task, area: area.title })))
    .sort((a, b) => Number(b.urgent ?? false) - Number(a.urgent ?? false));
  const urgent = tasks.filter((task) => task.urgent).length;
  const waiting = initiatives.length + tasks.length;
  const isNew = (products.count ?? 0) === 0;

  const summary = [
    initiatives.length ? plural(initiatives.length, "יוזמה אחת שהמערכת הכינה", "יוזמות שהמערכת הכינה") : null,
    tasks.length ? plural(tasks.length, "דבר אחד לטיפול", "דברים לטיפול") : null,
    urgent ? plural(urgent, "אחד דחוף", "דחופים") : null,
  ].filter((part) => part !== null);

  return (
    <div className="flex flex-col gap-10">
      <header className="bleed hero frame-row -mt-8 py-8 sm:-mt-10 sm:py-10">
        <div className="hero-in flex flex-wrap items-end justify-between gap-x-8 gap-y-6">
          <div className="min-w-0">
            <p className="eyebrow">{dayFormat.format(new Date(`${today}T00:00:00Z`))}</p>
            <h1 className="mt-2 text-3xl sm:text-4xl">
              {isNew ? "מתחילים. שלושה צעדים והמערכת עובדת." : waiting === 0 ? "הכול מטופל." : `${plural(waiting, "דבר אחד מחכה", "דברים מחכים")} לכם היום.`}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {isNew
                ? "ברגע שיש סחורה ומכירות במערכת, היא מתחילה להכין בשבילכם את הצעד הבא."
                : waiting === 0
                  ? "אין כרגע דבר שמחכה לאישור או לטיפול."
                  : `${summary.join(" · ")}.`}
            </p>
          </div>
          <nav aria-label="פעולות מהירות" className="flex flex-wrap gap-2">
            <Link href="/receiving/new" className="btn">
              קליטת סחורה
            </Link>
            <Link href="/sales/import" className="btn-quiet">
              ייבוא מכירות
            </Link>
            <Link href="/campaigns#new-campaign" className="btn-quiet">
              קמפיין חדש
            </Link>
          </nav>
        </div>
      </header>

      <div className="grid items-start gap-x-8 gap-y-10 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-10">
          {isNew && (
            <section aria-labelledby="start-heading">
              <h2 id="start-heading" className="text-xl">
                מתחילים כאן
              </h2>
              <ol className="card mt-4 divide-y divide-line p-0! sm:p-0!">
                {FIRST_STEPS.map((step, index) => (
                  <li key={step.href}>
                    <Link href={step.href} className="group flex items-center gap-4 px-5 py-4">
                      <span className="display grid size-9 shrink-0 place-items-center rounded-full bg-raised text-base tabular-nums">{index + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium group-hover:text-accent">{step.title}</span>
                        <span className="mt-0.5 block text-sm text-muted">{step.body}</span>
                      </span>
                      <span className="text-muted transition-transform group-hover:-translate-x-1" aria-hidden="true">←</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* A business with nothing in it yet has no queue to show; the first steps stand alone. */}
          {!(isNew && waiting === 0) && (<>
          <section id="initiatives" aria-labelledby="initiatives-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id="initiatives-heading" className="text-xl">
                המערכת הכינה, מחכה לאישור שלכם
              </h2>
              {initiatives.length > 0 && <span className="chip tabular-nums">{initiatives.length}</span>}
            </div>
            {initiatives.length === 0 ? (
              <p className="card mt-4 text-sm leading-relaxed text-muted">
                אין כרגע יוזמה חדשה. בכל כניסה המערכת בודקת חוסרים במלאי, מוצרים שלא נמכרו {SLOW_DAYS} יום, וחודש שנסגר ומחכה לרואה
                החשבון. כשאחד מהם קורה, הצעד הבא יופיע כאן מוכן.
              </p>
            ) : (
              <ul className="card mt-4 divide-y divide-line p-0! sm:p-0!">
                {initiatives.map((initiative) => {
                  const look = INITIATIVE_LOOK[initiative.kind];
                  return (
                    <li key={initiative.href} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
                      <span className="glyph size-9! rounded-[9px]! text-base!" style={{ "--glyph": look.tone } as React.CSSProperties} aria-hidden="true">
                        {look.glyph}
                      </span>
                      <div className="min-w-48 flex-1">
                        <h3 className="font-medium">
                          <bdi>{initiative.title}</bdi>
                        </h3>
                        <p className="mt-0.5 text-sm leading-relaxed text-muted">
                          <bdi>{initiative.reason}</bdi>
                        </p>
                      </div>
                      <Link href={initiative.href} className="btn">
                        {initiative.action}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted">שום דבר לא נשלח, לא מתפרסם ולא מוזמן בלי האישור שלכם.</p>
          </section>

          <section aria-labelledby="tasks-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id="tasks-heading" className="text-xl">
                מה מחכה לטיפול
              </h2>
              {tasks.length > 0 && <span className={`chip tabular-nums ${urgent ? "chip-warn" : ""}`}>{tasks.length}</span>}
            </div>
            {tasks.length === 0 ? (
              <p className="card mt-4 text-sm text-muted">הכול מטופל.</p>
            ) : (
              <ul className="card mt-4 divide-y divide-line p-0! sm:p-0!">
                {tasks.map((task) => (
                  <li key={task.text}>
                    <Link href={task.href} className="group flex min-h-14 items-center gap-3 px-5 py-3 text-sm">
                      <span className={`size-2 shrink-0 rounded-full ${task.urgent ? "bg-danger" : "bg-warn"}`} aria-hidden="true" />
                      <span className="min-w-0 flex-1 group-hover:underline">
                        {task.text}
                        {task.urgent && <span className="ms-2 text-xs font-medium text-danger">דחוף</span>}
                      </span>
                      <span className="hidden text-xs text-muted sm:block">{task.area}</span>
                      <span className="text-muted transition-transform group-hover:-translate-x-1" aria-hidden="true">←</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          </>)}
        </div>

        <aside aria-labelledby="areas-heading" className="min-w-0">
          <h2 id="areas-heading" className="text-xl">
            מצב העסק
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {areas.map((area) => (
              <Link key={area.href} href={area.href} className="card lift flex items-center gap-4">
                <span className="min-w-0 flex-1">
                  <span className="eyebrow block">{area.title}</span>
                  <bdi dir="ltr" className="display mt-2 block text-4xl tabular-nums">{area.figure.value}</bdi>
                  <span className="mt-1 block text-sm text-muted">{area.figure.label}</span>
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element -- a 4 KB decorative picture, already sized */}
                <img src={`/icons/3d/${area.icon}.webp`} alt="" width={44} height={44} className="icon-3d" />
              </Link>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Shown while the catalog is still empty: what gets a new business to its first initiative. */
const FIRST_STEPS = [
  { href: "/receiving/new", title: "קולטים את הסחורה הראשונה", body: "מצלמים תעודת משלוח או חשבונית. המוצרים נכנסים לקטלוג ולמלאי." },
  { href: "/sales/import", title: "מייבאים מכירות מהקופה", body: "כך המערכת יודעת מה נמכר, מה עומד ומה עומד להיגמר." },
  { href: "/integrations/setup", title: "מחברים את מערכות העסק", body: "קופה, אתר וספקים, בהקמה מודרכת." },
];
