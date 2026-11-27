"use client";

import { useState } from "react";
import { Mail, Phone, Search, UserCheck, X } from "lucide-react";
import { CUSTOMER_STAGE_LABELS, CUSTOMER_STAGES, formatCurrency, type CustomerStage } from "@/lib/suite";
import { ActionForm } from "@/components/action-form";
import { deleteCustomer, updateCustomerStage } from "@/app/(app)/crm/actions";

export type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  stage: CustomerStage;
  source: string | null;
  lifetime_value: number;
};

const STAGE_BADGES: Record<CustomerStage, string> = {
  lead: "bg-warning-soft text-warning",
  prospect: "bg-surface-subtle text-ink",
  active: "bg-accent-soft text-accent-strong",
  vip: "bg-accent text-(--btn-fg)",
  inactive: "bg-surface-subtle text-muted",
};

export function CrmDirectory({ customers, canDelete }: { customers: CustomerRow[]; canDelete: boolean }) {
  const [stageFilter, setStageFilter] = useState<CustomerStage | "all">("all");
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = customers.filter((c) => {
    if (stageFilter !== "all" && c.stage !== stageFilter) {
      return false;
    }
    if (!q) {
      return true;
    }
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone ?? "").toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q) ||
      (c.source ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Filter Pills + Live Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setStageFilter("all")}
            className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
              stageFilter === "all"
                ? "bg-accent text-(--btn-fg)"
                : "border border-line bg-surface-subtle/50 text-muted hover:text-ink"
            }`}
          >
            הכל ({customers.length})
          </button>
          {CUSTOMER_STAGES.map((stage) => {
            const count = customers.filter((c) => c.stage === stage).length;
            const active = stageFilter === stage;
            return (
              <button
                key={stage}
                type="button"
                onClick={() => setStageFilter(stage)}
                className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                  active
                    ? "bg-accent text-(--btn-fg)"
                    : "border border-line bg-surface-subtle/50 text-muted hover:text-ink"
                }`}
              >
                {CUSTOMER_STAGE_LABELS[stage]} ({count})
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="סינון לפי שם, טלפון, מקור…"
            className="field py-2 ps-9 pe-8 text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="ניקוי סינון"
              className="absolute end-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-md p-1 text-muted hover:text-ink"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-surface-subtle/40 px-4 py-10 text-center">
          <UserCheck className="mb-3 size-8 text-muted" aria-hidden />
          <p className="text-sm font-semibold text-ink">
            {customers.length === 0 ? "עוד אין לקוחות או לידים" : "לא נמצאו לקוחות התואמים לסינון"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {customers.length === 0
              ? "הוסיפו את הראשון למעלה."
              : "נסו להחליף שלב או לנקות את שדה החיפוש."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {filtered.map((customer) => {
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
    </div>
  );
}
