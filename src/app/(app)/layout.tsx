import { Suspense } from "react";
import { getBusinessContext } from "@/lib/auth";
import { CreateBusinessCard } from "@/components/create-business-card";
import { BusinessSwitcher } from "@/components/business-switcher";
import { SiteFooter, Wordmark } from "@/components/brand";
import { MainNav } from "@/components/main-nav";
import { can } from "@/lib/permissions";
import { AssistantChat } from "@/components/assistant-chat";
import { CommandPaletteTrigger } from "@/components/command-palette";
import { FooterArt, SiteHeader, ThemeToggle } from "@/components/motion";
import { logout } from "../(auth)/actions";
import { switchBusiness } from "./actions";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted">טוען…</p>}>
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
          <form action={logout} data-logout>
            <button type="submit" className="min-h-11 px-3 underline-offset-4 hover:underline">
              יציאה מהחשבון
            </button>
          </form>
        }
      />
    );
  }
  const { user, memberships, active } = context;
  const canManage = can(active.role, "accounting.view");

  return (
    <>
      <div className="frame">
        <SiteHeader>
          <div className="rail flex flex-wrap items-center gap-x-5 gap-y-2 py-3 sm:min-h-24">
            <Wordmark />
            {memberships.length > 1 ? (
              <BusinessSwitcher
                action={switchBusiness}
                activeId={active.businessId}
                businesses={memberships.map((m) => ({ id: m.businessId, name: m.businessName }))}
              />
            ) : (
              <span className="pill">{active.businessName}</span>
            )}
            <MainNav canManage={canManage}>
              <span className="ms-auto flex items-center gap-2 lg:ms-2">
                <CommandPaletteTrigger canManage={canManage} />
                <ThemeToggle />
              </span>
              <form action={logout} className="ms-2" data-logout>
                <button type="submit" className="btn-quiet" title={user.email}>
                  יציאה
                </button>
              </form>
            </MainNav>
          </div>
        </SiteHeader>
        <main className="rail flex-1 py-8 sm:py-10">{children}</main>
        <SiteFooter />
        <AssistantChat
          key={active.businessId}
          businessName={active.businessName}
          businessId={active.businessId}
          userId={user.id}
          canManage={canManage}
        />
      </div>
      <FooterArt />
    </>
  );
}
