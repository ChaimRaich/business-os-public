import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, PlugZap } from "lucide-react";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { INTEGRATION_CATEGORIES, isIntegrationReady } from "@/lib/integrations";
import { IntegrationCard } from "@/components/integration-card";

export const metadata: Metadata = { title: "אינטגרציות" };

export default async function IntegrationsPage() {
  const { active } = await requireBusiness();
  const canManage = can(active.role, "integrations.manage");
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("business_integrations")
    .select("id, category, provider, display_name, status, mode, account_ref, credential_hint, last_synced_at")
    .eq("business_id", active.businessId);
  if (error) {
    throw new Error(`Failed to load integrations: ${error.message}`);
  }

  const byCategory = new Map(rows.map((row) => [row.category, row]));
  const connectedCount = INTEGRATION_CATEGORIES.filter((c) => isIntegrationReady(byCategory.get(c.id)?.status)).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl sm:text-4xl">אינטגרציות</h1>
        <span className="badge bg-accent-soft px-3.5 py-1.5 text-accent-strong">
          <CheckCircle2 className="size-4" aria-hidden />
          <span>{connectedCount}/{INTEGRATION_CATEGORIES.length} מחוברות</span>
        </span>
      </div>

      {canManage && connectedCount < INTEGRATION_CATEGORIES.length && (
        <Link href="/integrations/setup" className="self-start text-sm font-medium text-accent-strong underline-offset-4 hover:underline">
          הקמה מודרכת
        </Link>
      )}

      {!canManage && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-line bg-surface-subtle/70 px-4 py-3 text-sm text-muted">
          <PlugZap className="size-4 shrink-0 text-accent" aria-hidden />
          <span>עריכה: בעלים או מנהל.</span>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {INTEGRATION_CATEGORIES.map((category) => (
          <IntegrationCard
            key={category.id}
            category={category}
            saved={byCategory.get(category.id)}
            canManage={canManage}
          />
        ))}
      </div>
    </div>
  );
}
