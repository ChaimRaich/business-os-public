import { Suspense } from "react";
import { getBusinessContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { CreateBusinessCard } from "@/components/create-business-card";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { AppShell } from "@/components/app-nav";
import { logout } from "../(auth)/actions";
import { switchBusiness } from "./actions";

// The app shell gates children behind business creation and mandatory integration onboarding.
export const instant = false;

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-5 py-3.5 text-sm text-muted shadow-xs">
            <span className="size-4 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden />
            <span>טוען את סביבת העבודה…</span>
          </div>
        </div>
      }
    >
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const context = await getBusinessContext();
  if (!context) {
    // First visit: rendered in place rather than redirected, so the browser never
    // caches "/" as a redirect that outlives the moment a business is created.
    return (
      <CreateBusinessCard
        footer={
          <form action={logout}>
            <button type="submit" className="min-h-11 px-3 underline-offset-4 hover:text-ink hover:underline">
              יציאה מהחשבון
            </button>
          </form>
        }
      />
    );
  }
  const { user, memberships, active } = context;

  // Mandatory end-to-end integration setup gate before entering the workspace.
  if (!active.onboardingCompletedAt) {
    const supabase = await createClient();
    const { data: integrations, error } = await supabase
      .from("business_integrations")
      .select("id, category, provider, display_name, status, mode, account_ref, credential_hint, last_synced_at")
      .eq("business_id", active.businessId);
    if (error) {
      throw new Error(`Failed to load integrations: ${error.message}`);
    }

    return (
      <OnboardingWizard
        businessName={active.businessName}
        activeBusinessId={active.businessId}
        businesses={memberships.map((m) => ({ id: m.businessId, name: m.businessName }))}
        userEmail={user.email}
        canManage={can(active.role, "integrations.manage")}
        integrations={integrations}
        switchBusiness={switchBusiness}
        logout={logout}
      />
    );
  }

  return (
    <AppShell
      userEmail={user.email}
      roleLabel={ROLE_LABELS[active.role]}
      activeBusiness={{ id: active.businessId, name: active.businessName }}
      businesses={memberships.map((m) => ({ id: m.businessId, name: m.businessName }))}
      switchBusiness={switchBusiness}
      logout={logout}
    >
      {children}
    </AppShell>
  );
}
