import Link from "next/link";
import {
  ArrowUpLeft,
  BarChart3,
  Building2,
  CheckCircle2,
  FileUp,
  Landmark,
  Megaphone,
  Package,
  PlugZap,
  Plus,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS } from "@/lib/permissions";
import { DOCUMENT_STATUS_LABELS, DOCUMENT_TYPE_LABELS } from "@/lib/documents";
import { INTEGRATION_CATEGORIES, isIntegrationReady } from "@/lib/integrations";
import { CUSTOMER_STAGE_LABELS, formatCurrency } from "@/lib/suite";

const STATUS_BADGES = {
  uploaded: "bg-surface-subtle text-muted",
  extracting: "bg-surface-subtle text-muted",
  review: "bg-warning-soft text-warning",
  failed: "bg-danger-soft text-danger",
  approved: "bg-accent-soft text-accent-strong",
} as const;

export default async function HomePage() {
  const { user, active } = await requireBusiness();
  const supabase = await createClient();

  const count = async (table: "products" | "documents") => {
    const { count: total, error } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("business_id", active.businessId);
    if (error) {
      throw new Error(`Failed to count ${table}: ${error.message}`);
    }
    return total ?? 0;
  };

  const [
    products,
    documentsCount,
    recentResult,
    accountsResult,
    ledgerResult,
    campaignsResult,
    customersResult,
    integrationsResult,
  ] = await Promise.all([
    count("products"),
    count("documents"),
    supabase
      .from("documents")
      .select("id, status, doc_type, doc_number, supplier_name_raw, created_at, suppliers (name)")
      .eq("business_id", active.businessId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("finance_accounts").select("balance").eq("business_id", active.businessId),
    supabase.from("ledger_entries").select("kind, status, amount").eq("business_id", active.businessId),
    supabase.from("campaigns").select("status, budget, spent, leads_count, revenue").eq("business_id", active.businessId),
    supabase.from("customers").select("stage, lifetime_value").eq("business_id", active.businessId),
    supabase
      .from("business_integrations")
      .select("category, display_name, status")
      .eq("business_id", active.businessId),
  ]);

  if (
    recentResult.error ||
    accountsResult.error ||
    ledgerResult.error ||
    campaignsResult.error ||
    customersResult.error ||
    integrationsResult.error
  ) {
    throw new Error(
      `Failed to load dashboard: ${(
        recentResult.error ??
        accountsResult.error ??
        ledgerResult.error ??
        campaignsResult.error ??
        customersResult.error ??
        integrationsResult.error
      )!.message}`,
    );
  }

  const recentDocuments = recentResult.data;
  const pendingReview = recentDocuments.filter((doc) => doc.status === "review").length;
  const totalBalance = accountsResult.data.reduce((sum, row) => sum + Number(row.balance), 0);

  const ledgerIncome = ledgerResult.data
    .filter((e) => e.kind === "income" || e.kind === "invoice")
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const ledgerExpense = ledgerResult.data
    .filter((e) => e.kind === "expense" || e.kind === "tax_payment")
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const cashflowMax = Math.max(ledgerIncome, ledgerExpense, 1);

  const campaigns = campaignsResult.data;
  const activeCampaigns = campaigns.filter((c) => c.status === "active").length;
  const campaignBudget = campaigns.reduce((sum, c) => sum + Number(c.budget), 0);
  const campaignSpent = campaigns.reduce((sum, c) => sum + Number(c.spent), 0);
  const campaignRevenue = campaigns.reduce((sum, c) => sum + Number(c.revenue), 0);
  const campaignRoas = campaignSpent > 0 ? campaignRevenue / campaignSpent : 0;

  const customers = customersResult.data;
  const stageCounts = {
    lead: customers.filter((c) => c.stage === "lead").length,
    prospect: customers.filter((c) => c.stage === "prospect").length,
    active: customers.filter((c) => c.stage === "active").length,
    vip: customers.filter((c) => c.stage === "vip").length,
  };
  const funnelMax = Math.max(stageCounts.lead, stageCounts.prospect, stageCounts.active, stageCounts.vip, 1);

  const integrationsByCategory = new Map(integrationsResult.data.map((i) => [i.category, i]));
  const connectedCount = INTEGRATION_CATEGORIES.filter((c) =>
    isIntegrationReady(integrationsByCategory.get(c.id)?.status),
  ).length;
  const dateFormatter = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeZone: "Asia/Jerusalem" });

  const stats = [
    { href: "/products", label: "מוצרים בקטלוג", value: String(products), icon: Package },
    {
      href: "/receiving",
      label: "קליטות סחורה",
      value: String(documentsCount),
      icon: FileUp,
      note: pendingReview > 0 ? `${pendingReview} ממתינות לאימות` : undefined,
    },
    {
      href: "/finance",
      label: "יתרת חשבונות",
      value: formatCurrency(totalBalance),
      icon: Landmark,
      ltr: true,
    },
    {
      href: "/campaigns",
      label: "קמפיינים ולקוחות",
      value: `${campaigns.length} / ${customers.length}`,
      icon: Megaphone,
      note: activeCampaigns > 0 ? `${activeCampaigns} קמפיינים פעילים` : "קמפיינים · CRM",
    },
  ];

  const quickActions = [
    {
      href: "/receiving/new",
      title: "קליטת סחורה חדשה",
      description: "צלמו תעודת משלוח או העלו PDF לקריאה אוטומטית וייצוא לקופה",
      icon: FileUp,
      featured: true,
    },
    {
      href: "/finance",
      title: "הנהלת חשבונות וחשבונות",
      description: "חשבונות בנק, סליקה, הוצאות, הכנסות וריכוז מע״מ לרו״ח",
      icon: Landmark,
    },
    {
      href: "/campaigns",
      title: "קמפיינים ושיווק",
      description: "ניהול קמפייני Meta / Google / WhatsApp, תקציב ו-ROAS",
      icon: Megaphone,
    },
    {
      href: "/crm",
      title: "לקוחות ו-CRM",
      description: "ניהול לידים, שלבי מכירה ומועדון לקוחות VIP",
      icon: Users,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Executive Welcome Hero */}
      <section className="card relative overflow-hidden p-5 sm:p-6">
        <div
          className="pointer-events-none absolute inset-0 opacity-60 dark:opacity-35"
          style={{
            backgroundImage:
              "radial-gradient(circle at 8% 15%, color-mix(in srgb, var(--bos-accent) 18%, transparent), transparent 46%)",
          }}
          aria-hidden
        />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2.5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/90 px-3 py-1 text-xs font-medium text-muted">
                <Building2 className="size-3.5 text-accent" aria-hidden />
                <span>{ROLE_LABELS[active.role]}</span>
                <span className="text-line-strong">·</span>
                <bdi dir="ltr">{user.email}</bdi>
              </span>
              <Link
                href="/integrations"
                className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-strong transition-opacity hover:opacity-90"
              >
                <span className="status-dot animate-pulse" aria-hidden />
                <span>{connectedCount}/{INTEGRATION_CATEGORIES.length} אינטגרציות פעילות</span>
              </Link>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{active.businessName}</h1>
            <p className="mt-1 text-sm text-muted">
              מרכז השליטה העסקי — מלאי, כספים, שיווק ולקוחות בתצוגה אחת.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Link href="/integrations" className="btn-quiet">
              <PlugZap className="size-4 text-accent" aria-hidden />
              <span>אינטגרציות</span>
            </Link>
            <Link href="/receiving/new" className="btn">
              <Plus className="size-4" aria-hidden />
              <span>קליטה חדשה</span>
            </Link>
          </div>
        </div>

        {/* Connected systems strip */}
        <div className="relative mt-5 grid grid-cols-2 gap-2.5 border-t border-line/80 pt-4 lg:grid-cols-4">
          {INTEGRATION_CATEGORIES.map((category) => {
            const row = integrationsByCategory.get(category.id);
            const ready = isIntegrationReady(row?.status);
            return (
              <Link
                key={category.id}
                href="/integrations"
                className="flex items-center gap-2.5 rounded-xl border border-line/80 bg-surface-subtle/50 px-3 py-2 transition-colors hover:border-accent/50 hover:bg-surface"
              >
                <CheckCircle2
                  className={`size-4 shrink-0 ${ready ? "text-accent" : "text-muted/50"}`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] text-muted">{category.shortTitle}</span>
                  <span className="block truncate text-xs font-bold text-ink">
                    {row?.display_name ?? "לא מחובר"}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link
              key={stat.href}
              href={stat.href}
              className="card-interactive group flex flex-col justify-between gap-4 p-4 sm:p-5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="icon-box transition-transform group-hover:scale-105">
                  <Icon className="size-4.5" aria-hidden />
                </span>
                <ArrowUpLeft
                  className="size-4 text-muted/60 transition-all group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-accent"
                  aria-hidden
                />
              </div>
              <div>
                <bdi
                  dir={stat.ltr ? "ltr" : "auto"}
                  className="block text-right text-2xl font-extrabold tracking-tight tabular-nums text-ink sm:text-3xl"
                >
                  {stat.value}
                </bdi>
                <span className="mt-0.5 block text-sm font-medium text-muted">{stat.label}</span>
                {stat.note && (
                  <span className="mt-2 inline-flex rounded-full bg-surface-subtle px-2.5 py-0.5 text-[11px] font-semibold text-muted">
                    {stat.note}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Visual Business Pulse: Finance, Campaigns, CRM */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Finance Pulse */}
        <section className="card flex flex-col justify-between gap-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
              <BarChart3 className="size-4 text-accent" aria-hidden />
              <span>תזרים והנה״ח</span>
            </h2>
            <Link href="/finance" className="text-xs font-semibold text-accent hover:underline">
              למסך כספים
            </Link>
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-muted">הכנסות וחשבוניות</span>
                <bdi dir="ltr" className="font-bold tabular-nums text-accent-strong">{formatCurrency(ledgerIncome)}</bdi>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-subtle">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-500"
                  style={{ width: `${ledgerIncome > 0 ? Math.max(8, Math.round((ledgerIncome / cashflowMax) * 100)) : 0}%` }}
                />
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-muted">הוצאות ותשלומי מס</span>
                <bdi dir="ltr" className="font-bold tabular-nums text-ink">{formatCurrency(ledgerExpense)}</bdi>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-subtle">
                <div
                  className="h-full rounded-full bg-danger/80 transition-all duration-500"
                  style={{ width: `${ledgerExpense > 0 ? Math.max(8, Math.round((ledgerExpense / cashflowMax) * 100)) : 0}%` }}
                />
              </div>
            </div>
          </div>
          <p className="border-t border-line pt-3 text-xs text-muted">
            נטו תפעולי:{" "}
            <bdi dir="ltr" className={`font-bold tabular-nums ${ledgerIncome - ledgerExpense >= 0 ? "text-accent-strong" : "text-danger"}`}>
              {formatCurrency(ledgerIncome - ledgerExpense)}
            </bdi>
          </p>
        </section>

        {/* Campaigns Pulse */}
        <section className="card flex flex-col justify-between gap-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
              <TrendingUp className="size-4 text-accent" aria-hidden />
              <span>ביצועי קמפיינים</span>
            </h2>
            <Link href="/campaigns" className="text-xs font-semibold text-accent hover:underline">
              לקמפיינים
            </Link>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <span className="block text-xs text-muted">החזר השקעה (ROAS)</span>
              <span className="mt-0.5 block text-2xl font-extrabold tabular-nums text-accent-strong">
                {campaignRoas > 0 ? `${campaignRoas.toFixed(1)}x` : "—"}
              </span>
            </div>
            <div className="text-left">
              <span className="block text-xs text-muted">הכנסות מיוחסות</span>
              <bdi dir="ltr" className="mt-0.5 block text-sm font-bold tabular-nums text-ink">
                {formatCurrency(campaignRevenue)}
              </bdi>
            </div>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-muted">
              <span>ניצול תקציב פרסום</span>
              <span className="tabular-nums">
                {campaignBudget > 0 ? `${Math.min(100, Math.round((campaignSpent / campaignBudget) * 100))}%` : "0%"}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-subtle">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${campaignBudget > 0 ? Math.min(100, Math.round((campaignSpent / campaignBudget) * 100)) : 0}%` }}
              />
            </div>
          </div>
        </section>

        {/* CRM Funnel Pulse */}
        <section className="card flex flex-col justify-between gap-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
              <Users className="size-4 text-accent" aria-hidden />
              <span>משפך לקוחות (CRM)</span>
            </h2>
            <Link href="/crm" className="text-xs font-semibold text-accent hover:underline">
              ל-CRM
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            {(["lead", "prospect", "active", "vip"] as const).map((stage) => {
              const value = stageCounts[stage];
              const pct = value > 0 ? Math.max(10, Math.round((value / funnelMax) * 100)) : 0;
              return (
                <div key={stage} className="flex items-center gap-2.5 text-xs">
                  <span className="w-20 shrink-0 truncate text-muted">{CUSTOMER_STAGE_LABELS[stage]}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-subtle">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        stage === "vip" ? "bg-accent" : stage === "active" ? "bg-accent/75" : stage === "lead" ? "bg-warning" : "bg-muted/60"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-6 text-left font-bold tabular-nums text-ink">{value}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Main two-column workspace */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Quick Actions */}
        <section className="card lg:col-span-7">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="section-heading">
              <Sparkles className="size-4.5 text-accent" aria-hidden />
              <span>פעולות מהירות</span>
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className={`group flex flex-col gap-2 rounded-xl border p-4 transition-all hover:-translate-y-0.5 ${
                    action.featured
                      ? "border-accent/35 bg-accent-soft/50 hover:border-accent"
                      : "border-line bg-surface-subtle/40 hover:border-line-strong hover:bg-surface-subtle"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex size-9 items-center justify-center rounded-xl ${
                        action.featured
                          ? "bg-accent text-white dark:text-[#041815]"
                          : "bg-surface text-accent shadow-xs"
                      }`}
                    >
                      <Icon className="size-4.5" aria-hidden />
                    </span>
                    <ArrowUpLeft
                      className="size-4 text-muted transition-transform group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-accent"
                      aria-hidden
                    />
                  </div>
                  <p className="mt-1 text-sm font-bold text-ink">{action.title}</p>
                  <p className="text-xs leading-relaxed text-muted">{action.description}</p>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Recent Receiving Feed */}
        <section className="card flex flex-col lg:col-span-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="section-heading">
              <FileUp className="size-4.5 text-accent" aria-hidden />
              <span>קליטות אחרונות</span>
            </h2>
            {recentDocuments.length > 0 && (
              <Link href="/receiving" className="text-xs font-semibold text-accent hover:underline">
                לכל הקליטות
              </Link>
            )}
          </div>

          {recentDocuments.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-line bg-surface-subtle/40 px-4 py-8 text-center">
              <span className="mb-3 inline-flex size-11 items-center justify-center rounded-2xl bg-surface text-muted shadow-xs">
                <FileUp className="size-5" aria-hidden />
              </span>
              <p className="text-sm font-semibold text-ink">עוד אין מסמכי קליטה</p>
              <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted">
                העלו חשבונית או תעודת משלוח כדי להתחיל לקלוט סחורה למלאי.
              </p>
              <Link href="/receiving/new" className="btn-quiet mt-4 min-h-9 px-3.5 text-xs">
                העלאת מסמך ראשון
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {recentDocuments.map((doc) => (
                <li key={doc.id}>
                  <Link
                    href={`/receiving/${doc.id}`}
                    className="-mx-2 flex items-center justify-between gap-3 rounded-xl px-2.5 py-3 transition-colors hover:bg-surface-subtle"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {doc.suppliers?.name ?? doc.supplier_name_raw ?? "מסמך ללא ספק"}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {[
                          doc.doc_type && DOCUMENT_TYPE_LABELS[doc.doc_type],
                          doc.doc_number,
                          dateFormatter.format(new Date(doc.created_at)),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <span className={`badge shrink-0 ${STATUS_BADGES[doc.status]}`}>
                      {DOCUMENT_STATUS_LABELS[doc.status]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
