import type { Metadata } from "next";
import { Mail, Phone, Plus, UserCheck, Users } from "lucide-react";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { CUSTOMER_STAGE_LABELS, CUSTOMER_STAGES, formatCurrency } from "@/lib/suite";
import { ActionForm } from "@/components/action-form";
import { createCustomer, deleteCustomer, updateCustomerStage } from "./actions";

export const metadata: Metadata = { title: "לקוחות ו-CRM" };

const STAGE_BADGES = {
  lead: "bg-warning-soft text-warning",
  prospect: "bg-surface-subtle text-ink",
  active: "bg-accent-soft text-accent-strong",
  vip: "bg-accent text-white dark:text-[#041815]",
  inactive: "bg-surface-subtle text-muted",
} as const;

export default async function CrmPage() {
  const { active } = await requireBusiness();
  const canDelete = can(active.role, "crm.delete");
  const supabase = await createClient();

  const { data: customers, error } = await supabase
    .from("customers")
    .select("id, name, phone, email, stage, source, lifetime_value, notes, created_at")
    .eq("business_id", active.businessId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    throw new Error(`Failed to load customers: ${error.message}`);
  }

  const leadsCount = customers.filter((c) => c.stage === "lead" || c.stage === "prospect").length;
  const activeClients = customers.filter((c) => c.stage === "active" || c.stage === "vip").length;
  const vipCount = customers.filter((c) => c.stage === "vip").length;
  const totalLtv = customers.reduce((sum, c) => sum + Number(c.lifetime_value), 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">לקוחות ו-CRM</h1>
        <p className="mt-0.5 text-sm text-muted">ניהול לידים מקמפיינים, מועדון לקוחות VIP ושווי לקוח מצטבר</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <div className="card p-4 sm:p-5">
          <span className="text-xs font-medium text-muted">סה״כ אנשי קשר</span>
          <span className="mt-2 block text-2xl font-extrabold tabular-nums text-ink">{customers.length}</span>
        </div>
        <div className="card p-4 sm:p-5">
          <span className="text-xs font-medium text-muted">לידים בתהליך</span>
          <span className="mt-2 block text-2xl font-extrabold tabular-nums text-warning">{leadsCount}</span>
        </div>
        <div className="card p-4 sm:p-5">
          <span className="text-xs font-medium text-muted">לקוחות פעילים / VIP</span>
          <span className="mt-2 block text-2xl font-extrabold tabular-nums text-accent-strong">
            {activeClients} <span className="text-xs font-medium text-muted">({vipCount} VIP)</span>
          </span>
        </div>
        <div className="card p-4 sm:p-5">
          <span className="text-xs font-medium text-muted">שווי לקוחות מצטבר</span>
          <bdi dir="ltr" className="mt-2 block text-right text-2xl font-extrabold tabular-nums text-ink">
            {formatCurrency(totalLtv)}
          </bdi>
        </div>
      </div>

      {/* Add Customer */}
      <section className="card">
        <h2 className="section-heading mb-4">
          <Plus className="size-4.5 text-accent" aria-hidden />
          <span>הוספת ליד / לקוח</span>
        </h2>
        <ActionForm
          action={createCustomer}
          submitLabel="שמירה ב-CRM"
          submitClassName="btn sm:col-span-2 lg:col-span-3 sm:justify-self-start"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          <div>
            <label className="label" htmlFor="cust-name">שם מלא</label>
            <input className="field" id="cust-name" name="name" placeholder="נועה לוי" required />
          </div>
          <div>
            <label className="label" htmlFor="cust-phone">טלפון</label>
            <input className="field" id="cust-phone" name="phone" type="tel" dir="ltr" placeholder="050-0000000" />
          </div>
          <div>
            <label className="label" htmlFor="cust-email">אימייל</label>
            <input className="field" id="cust-email" name="email" type="email" dir="ltr" placeholder="noa@example.com" />
          </div>
          <div>
            <label className="label" htmlFor="cust-stage">שלב</label>
            <select className="field min-h-11" id="cust-stage" name="stage" defaultValue="lead">
              {CUSTOMER_STAGES.map((stage) => (
                <option key={stage} value={stage}>{CUSTOMER_STAGE_LABELS[stage]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="cust-source">מקור הגעה</label>
            <input className="field" id="cust-source" name="source" placeholder="Meta Ads / חנות / אתר" />
          </div>
          <div>
            <label className="label" htmlFor="cust-ltv">שווי קניות מצטבר (₪)</label>
            <input className="field tabular-nums" id="cust-ltv" name="lifetime_value" dir="ltr" inputMode="decimal" defaultValue="0" />
          </div>
        </ActionForm>
      </section>

      {/* Customer List */}
      <section className="card">
        <h2 className="section-heading mb-4">
          <Users className="size-4.5 text-accent" aria-hidden />
          <span>מאגר לקוחות ולידים</span>
        </h2>

        {customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-surface-subtle/40 px-4 py-10 text-center">
            <UserCheck className="mb-3 size-8 text-muted" aria-hidden />
            <p className="text-sm font-semibold text-ink">עוד אין לקוחות או לידים</p>
            <p className="mt-1 text-xs text-muted">הוסיפו את איש הקשר הראשון למעלה כדי להתחיל לנהל קשרי לקוחות.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {customers.map((customer) => {
              const initial = (customer.name.trim()[0] ?? "ל").toUpperCase();
              return (
                <li key={customer.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 py-3.5">
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-accent-strong">
                    {initial}
                  </span>
                  <div className="min-w-0 flex-1 basis-52">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{customer.name}</span>
                      <span className={`badge ${STAGE_BADGES[customer.stage]}`}>
                        {CUSTOMER_STAGE_LABELS[customer.stage]}
                      </span>
                      {customer.source && (
                        <span className="badge bg-surface-subtle text-muted">{customer.source}</span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                      {customer.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="size-3" aria-hidden />
                          <bdi dir="ltr">{customer.phone}</bdi>
                        </span>
                      )}
                      {customer.email && (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="size-3" aria-hidden />
                          <bdi dir="ltr">{customer.email}</bdi>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-left">
                    <span className="block text-[11px] text-muted">שווי מצטבר</span>
                    <bdi dir="ltr" className="text-sm font-bold tabular-nums text-ink">
                      {formatCurrency(Number(customer.lifetime_value))}
                    </bdi>
                  </div>
                  <div className="flex items-center gap-2">
                    <ActionForm
                      action={updateCustomerStage}
                      submitLabel="שמירה"
                      submitClassName="btn-quiet min-h-9 px-3 text-xs"
                      className="flex items-center gap-2"
                    >
                      <input type="hidden" name="id" value={customer.id} />
                      <select
                        className="field min-h-9 w-auto py-1 text-xs"
                        name="stage"
                        defaultValue={customer.stage}
                        aria-label={`שלב של ${customer.name}`}
                      >
                        {CUSTOMER_STAGES.map((stage) => (
                          <option key={stage} value={stage}>{CUSTOMER_STAGE_LABELS[stage]}</option>
                        ))}
                      </select>
                    </ActionForm>
                    {canDelete && (
                      <ActionForm
                        action={deleteCustomer}
                        submitLabel="מחיקה"
                        submitClassName="min-h-9 cursor-pointer px-2 text-xs font-medium text-danger hover:underline"
                      >
                        <input type="hidden" name="id" value={customer.id} />
                      </ActionForm>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
