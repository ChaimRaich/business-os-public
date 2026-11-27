import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  CreditCard,
  Landmark,
  PlugZap,
  Plus,
  Receipt,
  Wallet,
} from "lucide-react";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { INTEGRATION_STATUS_LABELS } from "@/lib/integrations";
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  formatCurrency,
  LEDGER_KIND_LABELS,
  LEDGER_KINDS,
  LEDGER_STATUS_LABELS,
  LEDGER_STATUSES,
  type AccountType,
} from "@/lib/suite";
import { ActionForm } from "@/components/action-form";
import { createFinanceAccount, createLedgerEntry, deleteLedgerEntry, markLedgerPaid } from "./actions";

export const metadata: Metadata = { title: "הנהלת חשבונות וחשבונות" };

const STATUS_BADGES = {
  draft: "bg-surface-subtle text-muted",
  pending: "bg-warning-soft text-warning",
  paid: "bg-accent-soft text-accent-strong",
  overdue: "bg-danger-soft text-danger",
} as const;

export default async function FinancePage() {
  const { active } = await requireBusiness();
  const canManage = can(active.role, "finance.manage");
  const supabase = await createClient();

  const [accountsRes, entriesRes, integrationsRes] = await Promise.all([
    supabase
      .from("finance_accounts")
      .select("id, name, account_type, institution, account_number_last4, currency, balance")
      .eq("business_id", active.businessId)
      .order("created_at"),
    supabase
      .from("ledger_entries")
      .select("id, kind, status, title, counterparty, reference_number, amount, vat_amount, entry_date, due_date, finance_accounts (name)")
      .eq("business_id", active.businessId)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("business_integrations")
      .select("category, display_name, status")
      .eq("business_id", active.businessId)
      .in("category", ["accounting", "payments"]),
  ]);

  if (accountsRes.error || entriesRes.error || integrationsRes.error) {
    throw new Error(`Failed to load finance data: ${(accountsRes.error ?? entriesRes.error ?? integrationsRes.error)!.message}`);
  }

  const accounts = accountsRes.data;
  const entries = entriesRes.data;
  const accountingInt = integrationsRes.data.find((i) => i.category === "accounting");
  const paymentsInt = integrationsRes.data.find((i) => i.category === "payments");

  const totalBalance = accounts.reduce((sum, a) => sum + Number(a.balance), 0);
  const totalIncome = entries
    .filter((e) => (e.kind === "income" || e.kind === "invoice") && e.status === "paid")
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const pendingIncome = entries
    .filter((e) => (e.kind === "income" || e.kind === "invoice") && e.status !== "paid")
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const totalExpenses = entries
    .filter((e) => e.kind === "expense" || e.kind === "tax_payment")
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const netVat = entries.reduce((sum, e) => {
    const vat = Number(e.vat_amount);
    return e.kind === "income" || e.kind === "invoice" ? sum + vat : sum - vat;
  }, 0);

  const flowMax = Math.max(totalIncome, totalExpenses, pendingIncome, 1);
  const dateFmt = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeZone: "Asia/Jerusalem" });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">הנהלת חשבונות וחשבונות</h1>
          <p className="mt-0.5 text-sm text-muted">חשבונות בנק וסליקה, הכנסות והוצאות, מע״מ וריכוז לרואה החשבון</p>
        </div>
        <Link href="/integrations" className="btn-quiet min-h-9 px-3 text-xs">
          <PlugZap className="size-3.5 text-accent" aria-hidden />
          <span>
            {accountingInt?.display_name ?? "הנה״ח"} · {paymentsInt?.display_name ?? "סליקה"}
          </span>
        </Link>
      </div>

      {/* Connected Integrations Strip */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card-subtle flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="icon-box size-8">
              <Landmark className="size-4" aria-hidden />
            </span>
            <div>
              <p className="text-[11px] text-muted">ממשק הנהלת חשבונות / רו״ח</p>
              <p className="text-sm font-bold text-ink">{accountingInt?.display_name ?? "לא הוגדר"}</p>
            </div>
          </div>
          {accountingInt && (
            <span className="badge bg-accent-soft text-accent-strong">
              <span className="status-dot" aria-hidden />
              <span>{INTEGRATION_STATUS_LABELS[accountingInt.status]}</span>
            </span>
          )}
        </div>
        <div className="card-subtle flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="icon-box size-8">
              <CreditCard className="size-4" aria-hidden />
            </span>
            <div>
              <p className="text-[11px] text-muted">ממשק סליקה ובנקים</p>
              <p className="text-sm font-bold text-ink">{paymentsInt?.display_name ?? "לא הוגדר"}</p>
            </div>
          </div>
          {paymentsInt && (
            <span className="badge bg-accent-soft text-accent-strong">
              <span className="status-dot" aria-hidden />
              <span>{INTEGRATION_STATUS_LABELS[paymentsInt.status]}</span>
            </span>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <div className="card p-4 sm:p-5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <Wallet className="size-4 text-accent" aria-hidden />
            <span>יתרה כוללת בחשבונות</span>
          </span>
          <bdi dir="ltr" className="mt-2 block text-right text-2xl font-extrabold tabular-nums text-ink">
            {formatCurrency(totalBalance)}
          </bdi>
        </div>
        <div className="card p-4 sm:p-5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <ArrowDownLeft className="size-4 text-accent" aria-hidden />
            <span>הכנסות שנגבו</span>
          </span>
          <bdi dir="ltr" className="mt-2 block text-right text-2xl font-extrabold tabular-nums text-accent-strong">
            {formatCurrency(totalIncome)}
          </bdi>
        </div>
        <div className="card p-4 sm:p-5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <ArrowUpRight className="size-4 text-danger" aria-hidden />
            <span>הוצאות ומסים</span>
          </span>
          <bdi dir="ltr" className="mt-2 block text-right text-2xl font-extrabold tabular-nums text-ink">
            {formatCurrency(totalExpenses)}
          </bdi>
        </div>
        <div className="card p-4 sm:p-5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <Receipt className="size-4 text-warning" aria-hidden />
            <span>מע״מ נטו לתשלום / החזר</span>
          </span>
          <bdi dir="ltr" className="mt-2 block text-right text-2xl font-extrabold tabular-nums text-ink">
            {formatCurrency(netVat)}
          </bdi>
        </div>
      </div>

      {/* Visual Cashflow Bar Breakdown */}
      <section className="card">
        <h2 className="section-heading mb-4">
          <BarChart3 className="size-4.5 text-accent" aria-hidden />
          <span>פילוח תזרים</span>
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "הכנסות שנגבו", amount: totalIncome, bar: "bg-accent", text: "text-accent-strong" },
            { label: "חשבוניות פתוחות לגבייה", amount: pendingIncome, bar: "bg-warning", text: "text-warning" },
            { label: "הוצאות ותשלומי מס", amount: totalExpenses, bar: "bg-danger/80", text: "text-danger" },
          ].map((row) => (
            <div key={row.label} className="rounded-xl border border-line bg-surface-subtle/40 p-3.5">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-medium text-muted">{row.label}</span>
                <bdi dir="ltr" className={`font-bold tabular-nums ${row.text}`}>{formatCurrency(row.amount)}</bdi>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-line/70">
                <div
                  className={`h-full rounded-full ${row.bar} transition-all duration-500`}
                  style={{ width: `${row.amount > 0 ? Math.max(8, Math.round((row.amount / flowMax) * 100)) : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Accounts */}
      <section className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-heading">
            <Landmark className="size-4.5 text-accent" aria-hidden />
            <span>חשבונות בנק, סליקה וקופות ({accounts.length})</span>
          </h2>
        </div>
        {accounts.length === 0 ? (
          <p className="rounded-xl bg-surface-subtle/60 px-4 py-3 text-sm text-muted">
            עוד לא הוגדרו חשבונות. הוסיפו חשבון בנק, מסוף סליקה או קופה לניהול התזרים.
          </p>
        ) : (
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((account) => (
              <div
                key={account.id}
                className="relative overflow-hidden rounded-2xl border border-line bg-surface-subtle/40 p-4 transition-all hover:border-accent/45"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="badge bg-surface text-muted">
                    {ACCOUNT_TYPE_LABELS[account.account_type as AccountType] ?? account.account_type}
                  </span>
                  {account.account_number_last4 && (
                    <bdi dir="ltr" className="font-mono text-xs text-muted">••{account.account_number_last4}</bdi>
                  )}
                </div>
                <p className="mt-3 font-bold text-ink">{account.name}</p>
                {account.institution && <p className="text-xs text-muted">{account.institution}</p>}
                <bdi dir="ltr" className="mt-3 block text-right text-xl font-extrabold tabular-nums text-ink">
                  {formatCurrency(Number(account.balance))}
                </bdi>
              </div>
            ))}
          </div>
        )}

        {canManage && (
          <details className="group mt-5 border-t border-line pt-4" open={accounts.length === 0}>
            <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-accent hover:underline">
              <Plus className="size-4" aria-hidden />
              <span>הוספת חשבון בנק / סליקה</span>
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <ActionForm action={createFinanceAccount} submitLabel="הוספת חשבון" submitClassName="btn sm:self-end" className="card-subtle mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <label className="label" htmlFor="acc-name">שם החשבון</label>
                <input className="field" id="acc-name" name="name" placeholder="עו״ש עסקי" required />
              </div>
              <div>
                <label className="label" htmlFor="acc-type">סוג</label>
                <select className="field min-h-11" id="acc-type" name="account_type" defaultValue="bank">
                  {ACCOUNT_TYPES.map((t) => (
                    <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="acc-inst">מוסד / ספק</label>
                <input className="field" id="acc-inst" name="institution" placeholder="בנק לאומי / CardCom" />
              </div>
              <div>
                <label className="label" htmlFor="acc-bal">יתרה פתיחה (₪)</label>
                <input className="field tabular-nums" id="acc-bal" name="balance" dir="ltr" inputMode="decimal" defaultValue="0" />
              </div>
            </ActionForm>
          </details>
        )}
      </section>

      {/* Ledger */}
      <section className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-heading">
            <Receipt className="size-4.5 text-accent" aria-hidden />
            <span>יומן תנועות, חשבוניות וראיית חשבון ({entries.length})</span>
          </h2>
        </div>

        {canManage && (
          <details className="group mb-5" open={entries.length === 0}>
            <summary className="btn-quiet inline-flex min-h-10 cursor-pointer list-none text-xs font-semibold">
              <Plus className="size-4 text-accent" aria-hidden />
              <span>רישום תנועה / חשבונית חדשה</span>
              <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <ActionForm
              action={createLedgerEntry}
              submitLabel="רישום תנועה"
              submitClassName="btn sm:col-span-2 lg:col-span-4 sm:justify-self-start"
              className="card-subtle mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              <div>
                <label className="label" htmlFor="entry-kind">סוג תנועה</label>
                <select className="field min-h-11" id="entry-kind" name="kind" defaultValue="invoice">
                  {LEDGER_KINDS.map((k) => (
                    <option key={k} value={k}>{LEDGER_KIND_LABELS[k]}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="entry-title">תיאור</label>
                <input className="field" id="entry-title" name="title" placeholder="חשבונית ספק / מכירה יומית / מקדמת מע״מ" required />
              </div>
              <div>
                <label className="label" htmlFor="entry-status">סטטוס</label>
                <select className="field min-h-11" id="entry-status" name="status" defaultValue="pending">
                  {LEDGER_STATUSES.map((s) => (
                    <option key={s} value={s}>{LEDGER_STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="entry-counterparty">לקוח / ספק / רשות</label>
                <input className="field" id="entry-counterparty" name="counterparty" placeholder="שם הגורם" />
              </div>
              <div>
                <label className="label" htmlFor="entry-ref">מספר מסמך / אסמכתא</label>
                <input className="field font-mono text-sm" id="entry-ref" name="reference_number" dir="ltr" placeholder="INV-1001" />
              </div>
              <div>
                <label className="label" htmlFor="entry-amount">סכום כולל (₪)</label>
                <input className="field tabular-nums" id="entry-amount" name="amount" dir="ltr" inputMode="decimal" required />
              </div>
              <div>
                <label className="label" htmlFor="entry-vat">מתוכו מע״מ (₪)</label>
                <input className="field tabular-nums" id="entry-vat" name="vat_amount" dir="ltr" inputMode="decimal" defaultValue="0" />
              </div>
              <div>
                <label className="label" htmlFor="entry-account">חשבון</label>
                <select className="field min-h-11" id="entry-account" name="account_id" defaultValue="">
                  <option value="">ללא שיוך</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="entry-date">תאריך</label>
                <input className="field" id="entry-date" name="entry_date" type="date" />
              </div>
            </ActionForm>
          </details>
        )}

        {entries.length === 0 ? (
          <p className="rounded-xl bg-surface-subtle/60 px-4 py-6 text-center text-sm text-muted">
            עוד לא נרשמו תנועות הנהלת חשבונות.
          </p>
        ) : (
          <div className="-mx-2 overflow-x-auto px-2">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-subtle/60 text-right text-xs font-semibold text-muted">
                  {["תאריך", "סוג", "תיאור וגורם", "אסמכתא", "סכום", "מע״מ", "סטטוס", ""].map((h, i) => (
                    <th key={i} className="px-3 py-2.5 text-right font-semibold first:rounded-s-lg last:rounded-e-lg">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {entries.map((entry) => {
                  const isInflow = entry.kind === "income" || entry.kind === "invoice";
                  return (
                    <tr key={entry.id} className="transition-colors hover:bg-surface-subtle/40">
                      <td className="px-3 py-3 text-xs tabular-nums text-muted">
                        {dateFmt.format(new Date(entry.entry_date))}
                      </td>
                      <td className="px-3 py-3">
                        <span className="badge bg-surface-subtle text-ink">{LEDGER_KIND_LABELS[entry.kind]}</span>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-semibold text-ink">{entry.title}</p>
                        {(entry.counterparty || entry.finance_accounts?.name) && (
                          <p className="text-xs text-muted">
                            {[entry.counterparty, entry.finance_accounts?.name].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-muted">
                        <bdi dir="ltr">{entry.reference_number ?? "—"}</bdi>
                      </td>
                      <td className={`px-3 py-3 font-bold tabular-nums ${isInflow ? "text-accent-strong" : "text-ink"}`}>
                        <bdi dir="ltr">{isInflow ? "+" : "-"}{formatCurrency(Number(entry.amount))}</bdi>
                      </td>
                      <td className="px-3 py-3 text-xs tabular-nums text-muted">
                        <bdi dir="ltr">{formatCurrency(Number(entry.vat_amount))}</bdi>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`badge ${STATUS_BADGES[entry.status]}`}>
                          {LEDGER_STATUS_LABELS[entry.status]}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {canManage && (
                          <div className="flex items-center gap-2">
                            {entry.status !== "paid" && (
                              <ActionForm
                                action={markLedgerPaid}
                                submitLabel="סמן כשולם"
                                submitClassName="cursor-pointer text-xs font-semibold text-accent hover:underline"
                              >
                                <input type="hidden" name="id" value={entry.id} />
                              </ActionForm>
                            )}
                            <ActionForm
                              action={deleteLedgerEntry}
                              submitLabel="מחיקה"
                              submitClassName="cursor-pointer text-xs font-medium text-danger hover:underline"
                            >
                              <input type="hidden" name="id" value={entry.id} />
                            </ActionForm>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
