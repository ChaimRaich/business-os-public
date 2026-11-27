import type { Metadata } from "next";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { OnboardingWizard } from "@/components/onboarding-wizard";

export const metadata: Metadata = { title: "הקמת העסק" };

/** The setup wizard. Optional: the workspace is open whether or not it was finished. */
export default async function IntegrationsSetupPage() {
  const { active } = await requireBusiness();
  const supabase = await createClient();

  const [integrations, business] = await Promise.all([
    supabase
      .from("business_integrations")
      .select("id, category, provider, display_name, status, mode, account_ref, credential_hint, last_synced_at")
      .eq("business_id", active.businessId),
    supabase.from("businesses").select("onboarding_completed_at").eq("id", active.businessId).single(),
  ]);
  if (integrations.error || business.error) {
    throw new Error(`Failed to load integrations: ${(integrations.error ?? business.error)!.message}`);
  }

  return (
    <OnboardingWizard
      canManage={can(active.role, "integrations.manage")}
      completed={business.data.onboarding_completed_at !== null}
      integrations={integrations.data}
    />
  );
}
