import type { Metadata } from "next";
import { ChevronDown, Plus, Users } from "lucide-react";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { CUSTOMER_STAGE_LABELS, CUSTOMER_STAGES, formatCurrency } from "@/lib/suite";
import { ActionForm } from "@/components/action-form";
import { CrmDirectory } from "@/components/crm-directory";
import { createCustomer } from "./actions";

export const metadata: Metadata = { title: "לקוחות" };

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
      <h1 className="text-3xl sm:text-4xl">לקוחות</h1>

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

      {/* Customer Directory + Collapsible Add Form */}
      <section className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-heading">
            <Users className="size-4.5 text-accent" aria-hidden />
            <span>מאגר לקוחות ולידים</span>
          </h2>
        </div>

        <details className="group mb-5" open={customers.length === 0}>
          <summary className="btn-quiet inline-flex min-h-10 cursor-pointer list-none text-xs font-semibold">
            <Plus className="size-4 text-accent" aria-hidden />
            <span>הוספת ליד / לקוח חדש</span>
            <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <ActionForm
            action={createCustomer}
            submitLabel="שמירה ב-CRM"
            submitClassName="btn sm:col-span-2 lg:col-span-3 sm:justify-self-start"
            className="card-subtle mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
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
        </details>

        <CrmDirectory
          customers={customers.map((c) => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            email: c.email,
            stage: c.stage,
            source: c.source,
            lifetime_value: Number(c.lifetime_value),
          }))}
          canDelete={canDelete}
        />
      </section>
    </div>
  );
}
