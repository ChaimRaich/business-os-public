import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, ChevronDown, Megaphone, PlugZap, Plus, Target, TrendingUp, Users } from "lucide-react";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { INTEGRATION_STATUS_LABELS } from "@/lib/integrations";
import {
  CAMPAIGN_CHANNEL_LABELS,
  CAMPAIGN_CHANNELS,
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUSES,
  formatCurrency,
} from "@/lib/suite";
import { ActionForm } from "@/components/action-form";
import { createCampaign, deleteCampaign, updateCampaignStatus } from "./actions";

export const metadata: Metadata = { title: "קמפיינים ושיווק" };

const STATUS_BADGES = {
  draft: "bg-surface-subtle text-muted",
  active: "bg-accent-soft text-accent-strong",
  paused: "bg-warning-soft text-warning",
  completed: "bg-surface-subtle text-ink",
} as const;

export default async function CampaignsPage() {
  const { active } = await requireBusiness();
  const canManage = can(active.role, "campaigns.manage");
  const supabase = await createClient();

  const [campaignsRes, integrationRes] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, name, channel, status, budget, spent, leads_count, conversions_count, revenue, start_date, end_date")
      .eq("business_id", active.businessId)
      .order("created_at", { ascending: false }),
    supabase
      .from("business_integrations")
      .select("display_name, status")
      .eq("business_id", active.businessId)
      .eq("category", "marketing_crm")
      .maybeSingle(),
  ]);

  if (campaignsRes.error || integrationRes.error) {
    throw new Error(`Failed to load campaigns: ${(campaignsRes.error ?? integrationRes.error)!.message}`);
  }

  const campaigns = campaignsRes.data;
  const marketingInt = integrationRes.data;

  const activeCount = campaigns.filter((c) => c.status === "active").length;
  const totalBudget = campaigns.reduce((sum, c) => sum + Number(c.budget), 0);
  const totalSpent = campaigns.reduce((sum, c) => sum + Number(c.spent), 0);
  const totalLeads = campaigns.reduce((sum, c) => sum + c.leads_count, 0);
  const totalRevenue = campaigns.reduce((sum, c) => sum + Number(c.revenue), 0);
  const roas = totalSpent > 0 ? totalRevenue / totalSpent : 0;

  // Channel performance breakdown
  const channelStats = CAMPAIGN_CHANNELS.map((channel) => {
    const rows = campaigns.filter((c) => c.channel === channel);
    return {
      channel,
      count: rows.length,
      spent: rows.reduce((s, r) => s + Number(r.spent), 0),
      revenue: rows.reduce((s, r) => s + Number(r.revenue), 0),
      leads: rows.reduce((s, r) => s + r.leads_count, 0),
    };
  }).filter((row) => row.count > 0);
  const maxChannelRev = Math.max(...channelStats.map((r) => Math.max(r.revenue, r.spent)), 1);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">קמפיינים ושיווק</h1>
          <p className="mt-0.5 text-sm text-muted">ניהול תקציבי פרסום, ערוצים, לידים והחזר השקעה (ROAS)</p>
        </div>
        <Link href="/integrations" className="btn-quiet min-h-9 px-3 text-xs">
          <PlugZap className="size-3.5 text-accent" aria-hidden />
          <span>
            {marketingInt ? `${marketingInt.display_name} · ${INTEGRATION_STATUS_LABELS[marketingInt.status]}` : "הגדרת חיבור שיווק"}
          </span>
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <div className="card p-4 sm:p-5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <Megaphone className="size-4 text-accent" aria-hidden />
            <span>קמפיינים פעילים</span>
          </span>
          <span className="mt-2 block text-2xl font-extrabold tabular-nums text-ink">{activeCount}</span>
          <span className="text-xs text-muted">מתוך {campaigns.length} קמפיינים</span>
        </div>
        <div className="card p-4 sm:p-5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <Target className="size-4 text-accent" aria-hidden />
            <span>הוצאה מול תקציב</span>
          </span>
          <bdi dir="ltr" className="mt-2 block text-right text-2xl font-extrabold tabular-nums text-ink">
            {formatCurrency(totalSpent)}
          </bdi>
          <span className="text-xs text-muted">תקציב: {formatCurrency(totalBudget)}</span>
        </div>
        <div className="card p-4 sm:p-5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <Users className="size-4 text-accent" aria-hidden />
            <span>לידים שנוצרו</span>
          </span>
          <span className="mt-2 block text-2xl font-extrabold tabular-nums text-ink">{totalLeads}</span>
          <span className="text-xs text-muted">
            עלות לליד: {totalLeads > 0 ? formatCurrency(totalSpent / totalLeads) : "—"}
          </span>
        </div>
        <div className="card p-4 sm:p-5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <TrendingUp className="size-4 text-accent" aria-hidden />
            <span>הכנסות · ROAS</span>
          </span>
          <bdi dir="ltr" className="mt-2 block text-right text-2xl font-extrabold tabular-nums text-accent-strong">
            {formatCurrency(totalRevenue)}
          </bdi>
          <span className="text-xs font-semibold text-muted">
            ROAS: {roas > 0 ? `${roas.toFixed(1)}x` : "—"}
          </span>
        </div>
      </div>

      {/* Channel Performance Bars */}
      {channelStats.length > 0 && (
        <section className="card">
          <h2 className="section-heading mb-4">
            <BarChart3 className="size-4.5 text-accent" aria-hidden />
            <span>ביצועים לפי ערוץ פרסום</span>
          </h2>
          <div className="flex flex-col gap-3">
            {channelStats.map((row) => (
              <div key={row.channel} className="rounded-xl border border-line bg-surface-subtle/40 p-3.5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-ink">
                    {CAMPAIGN_CHANNEL_LABELS[row.channel]}{" "}
                    <span className="font-normal text-muted">({row.count} קמפיינים · {row.leads} לידים)</span>
                  </span>
                  <span className="flex items-center gap-3 tabular-nums">
                    <span className="text-muted">הוצאה: <bdi dir="ltr" className="font-semibold text-ink">{formatCurrency(row.spent)}</bdi></span>
                    <span className="text-muted">הכנסה: <bdi dir="ltr" className="font-bold text-accent-strong">{formatCurrency(row.revenue)}</bdi></span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-line/70">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-500"
                    style={{ width: `${Math.max(6, Math.round((Math.max(row.revenue, row.spent) / maxChannelRev) * 100))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Campaigns List + Collapsible Create */}
      <section className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-heading">
            <Megaphone className="size-4.5 text-accent" aria-hidden />
            <span>רשימת קמפיינים ({campaigns.length})</span>
          </h2>
        </div>

        {canManage && (
          <details className="group mb-5" open={campaigns.length === 0}>
            <summary className="btn-quiet inline-flex min-h-10 cursor-pointer list-none text-xs font-semibold">
              <Plus className="size-4 text-accent" aria-hidden />
              <span>יצירת קמפיין חדש</span>
              <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <ActionForm
              action={createCampaign}
              submitLabel="יצירת קמפיין"
              submitClassName="btn sm:col-span-2 lg:col-span-4 sm:justify-self-start"
              className="card-subtle mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              <div className="sm:col-span-2">
                <label className="label" htmlFor="camp-name">שם הקמפיין</label>
                <input className="field" id="camp-name" name="name" placeholder="מבצע קולקציית חורף · Instagram" required />
              </div>
              <div>
                <label className="label" htmlFor="camp-channel">ערוץ</label>
                <select className="field min-h-11" id="camp-channel" name="channel" defaultValue="meta_ads">
                  {CAMPAIGN_CHANNELS.map((c) => (
                    <option key={c} value={c}>{CAMPAIGN_CHANNEL_LABELS[c]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="camp-status">סטטוס</label>
                <select className="field min-h-11" id="camp-status" name="status" defaultValue="active">
                  {CAMPAIGN_STATUSES.map((s) => (
                    <option key={s} value={s}>{CAMPAIGN_STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="camp-budget">תקציב (₪)</label>
                <input className="field tabular-nums" id="camp-budget" name="budget" dir="ltr" inputMode="decimal" defaultValue="2000" />
              </div>
              <div>
                <label className="label" htmlFor="camp-spent">הוצאה בפועל (₪)</label>
                <input className="field tabular-nums" id="camp-spent" name="spent" dir="ltr" inputMode="decimal" defaultValue="0" />
              </div>
              <div>
                <label className="label" htmlFor="camp-leads">לידים</label>
                <input className="field tabular-nums" id="camp-leads" name="leads_count" dir="ltr" inputMode="numeric" defaultValue="0" />
              </div>
              <div>
                <label className="label" htmlFor="camp-rev">הכנסות מיוחסות (₪)</label>
                <input className="field tabular-nums" id="camp-rev" name="revenue" dir="ltr" inputMode="decimal" defaultValue="0" />
              </div>
            </ActionForm>
          </details>
        )}

        {campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-surface-subtle/40 px-4 py-10 text-center">
            <Megaphone className="mb-3 size-8 text-muted" aria-hidden />
            <p className="text-sm font-semibold text-ink">עוד אין קמפיינים במערכת</p>
            <p className="mt-1 text-xs text-muted">צרו קמפיין ראשון למעלה כדי לעקוב אחרי תקציב, לידים והחזר השקעה.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {campaigns.map((campaign) => {
              const budget = Number(campaign.budget);
              const spent = Number(campaign.spent);
              const revenue = Number(campaign.revenue);
              const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
              const campRoas = spent > 0 ? revenue / spent : 0;

              return (
                <div key={campaign.id} className="rounded-xl border border-line bg-surface-subtle/30 p-4 transition-colors hover:border-line-strong">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-ink">{campaign.name}</h3>
                        <span className="badge bg-surface text-muted">{CAMPAIGN_CHANNEL_LABELS[campaign.channel]}</span>
                        <span className={`badge ${STATUS_BADGES[campaign.status]}`}>
                          {campaign.status === "active" && <span className="status-dot animate-pulse" aria-hidden />}
                          <span>{CAMPAIGN_STATUS_LABELS[campaign.status]}</span>
                        </span>
                        {campRoas > 0 && (
                          <span className="badge bg-accent-soft text-accent-strong tabular-nums">
                            {campRoas.toFixed(1)}x ROAS
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                        <span>תקציב: <strong className="text-ink tabular-nums">{formatCurrency(budget)}</strong></span>
                        <span>הוצאה: <strong className="text-ink tabular-nums">{formatCurrency(spent)}</strong></span>
                        <span>לידים: <strong className="text-ink tabular-nums">{campaign.leads_count}</strong></span>
                        <span>הכנסות: <strong className="text-accent-strong tabular-nums">{formatCurrency(revenue)}</strong></span>
                      </div>
                    </div>

                    {canManage && (
                      <div className="flex flex-wrap items-center gap-2">
                        <ActionForm
                          action={updateCampaignStatus}
                          submitLabel="עדכון"
                          submitClassName="btn-quiet min-h-9 px-3 text-xs"
                          className="flex items-center gap-2"
                        >
                          <input type="hidden" name="id" value={campaign.id} />
                          <select
                            className="field min-h-9 w-auto py-1 text-xs"
                            name="status"
                            defaultValue={campaign.status}
                            aria-label={`סטטוס של ${campaign.name}`}
                          >
                            {CAMPAIGN_STATUSES.map((s) => (
                              <option key={s} value={s}>{CAMPAIGN_STATUS_LABELS[s]}</option>
                            ))}
                          </select>
                        </ActionForm>
                        <ActionForm
                          action={deleteCampaign}
                          submitLabel="מחיקה"
                          submitClassName="min-h-9 cursor-pointer px-2 text-xs font-medium text-danger hover:underline"
                        >
                          <input type="hidden" name="id" value={campaign.id} />
                        </ActionForm>
                      </div>
                    )}
                  </div>

                  {budget > 0 && (
                    <div className="mt-3">
                      <div className="mb-1 flex justify-between text-[11px] text-muted">
                        <span>ניצול תקציב</span>
                        <span className="tabular-nums">{pct}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-line">
                        <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
