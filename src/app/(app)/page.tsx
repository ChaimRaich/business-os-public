import Link from "next/link";
import {
  ArrowUpLeft,
  Building2,
  CheckCircle2,
  FileUp,
  Landmark,
  Megaphone,
  Package,
  PlugZap,
  Plus,
  Sparkles,
  Users,
} from "lucide-react";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS } from "@/lib/permissions";
import { DOCUMENT_STATUS_LABELS, DOCUMENT_TYPE_LABELS } from "@/lib/documents";
import { INTEGRATION_CATEGORIES, isIntegrationReady } from "@/lib/integrations";
import { formatCurrency } from "@/lib/suite";

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

  const count = async (table: "products" | "suppliers" | "documents" | "campaigns" | "customers") => {
    const { count: total, error } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("business_id", active.businessId);
    if (error) {
      throw new Error(`Failed to count ${table}: ${error.message}`);
    }
    return total ?? 0;
  };

  const [products, documentsCount, campaignsCount, customersCount, recentResult, accountsResult, integrationsResult] =
    await Promise.all([
      count("products"),
      count("documents"),
      count("campaigns"),
      count("customers"),
      supabase
        .from("documents")
        .select("id, status, doc_type, doc_number, supplier_name_raw, created_at, suppliers (name)")
        .eq("business_id", active.businessId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase.from("finance_accounts").select("balance").eq("business_id", active.businessId),
      supabase
        .from("business_integrations")
        .select("category, display_name, status")
        .eq("business_id", active.businessId),
    ]);

  if (recentResult.error || accountsResult.error || integrationsResult.error) {
    throw new Error(
      `Failed to load dashboard: ${(recentResult.error ?? accountsResult.error ?? integrationsResult.error)!.message}`,
    );
  }

  const recentDocuments = recentResult.data;
  const pendingReview = recentDocuments.filter((doc) => doc.status === "review").length;
  const totalBalance = accountsResult.data.reduce((sum, row) => sum + Number(row.balance), 0);
  const integrationsByCategory = new Map(integrationsResult.data.map((i) => [i.category, i]));
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
      value: `${campaignsCount} / ${customersCount}`,
      icon: Megaphone,
      note: "קמפיינים · אנשי קשר",
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
    <div className="flex flex-col gap-7">
      {/* Hero Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted">
            <Building2 className="size-3.5 text-accent" aria-hidden />
            <span>{ROLE_LABELS[active.role]}</span>
            <span className="text-line-strong">·</span>
            <bdi dir="ltr">{user.email}</bdi>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{active.businessName}</h1>
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

      {/* Integration Health Strip */}
      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-xs font-bold text-muted">
            <PlugZap className="size-3.5 text-accent" aria-hidden />
            <span>מערכות מחוברות לעסק</span>
          </span>
          <Link href="/integrations" className="text-xs font-semibold text-accent hover:underline">
            ניהול חיבורים
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {INTEGRATION_CATEGORIES.map((category) => {
            const row = integrationsByCategory.get(category.id);
            const ready = isIntegrationReady(row?.status);
            return (
              <Link
                key={category.id}
                href="/integrations"
                className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-subtle/50 px-3 py-2.5 transition-colors hover:border-accent/50"
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
              className="card group flex flex-col justify-between gap-4 p-4 transition-all hover:-translate-y-0.5 hover:border-accent/50 sm:p-5"
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

      {/* Main two-column workspace */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Quick Actions */}
        <section className="card lg:col-span-7">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="section-heading">
              <Sparkles className="size-4.5 text-accent" aria-hidden />
              <span>ניהול העסק מקצה לקצה</span>
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
