import { Suspense } from "react";
import Link from "next/link";
import { getBusinessContext } from "@/lib/auth";
import { CreateBusinessCard } from "@/components/create-business-card";
import { BusinessSwitcher } from "@/components/business-switcher";
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
          <form action={logout}>
            <button type="submit" className="min-h-11 px-3 underline-offset-4 hover:underline">
              יציאה מהחשבון
            </button>
          </form>
        }
      />
    );
  }
  const { user, memberships, active } = context;

  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/" className="text-sm font-semibold tracking-[0.2em] text-accent">
            BUSINESS OS
          </Link>
          {memberships.length > 1 ? (
            <BusinessSwitcher
              action={switchBusiness}
              activeId={active.businessId}
              businesses={memberships.map((m) => ({ id: m.businessId, name: m.businessName }))}
            />
          ) : (
            <span className="text-sm font-medium">{active.businessName}</span>
          )}
          <nav className="-mx-2 flex basis-full flex-wrap items-center text-sm sm:mx-0 sm:ms-auto sm:basis-auto sm:gap-1">
            <Link href="/" className="rounded-lg px-2.5 py-2.5 hover:bg-canvas sm:px-3">
              ראשי
            </Link>
            <Link href="/receiving" className="rounded-lg px-2.5 py-2.5 hover:bg-canvas sm:px-3">
              קליטה
            </Link>
            <Link href="/products" className="rounded-lg px-2.5 py-2.5 hover:bg-canvas sm:px-3">
              מוצרים
            </Link>
            <Link href="/suppliers" className="rounded-lg px-2.5 py-2.5 hover:bg-canvas sm:px-3">
              ספקים
            </Link>
            <Link href="/settings" className="rounded-lg px-2.5 py-2.5 hover:bg-canvas sm:px-3">
              הגדרות
            </Link>
            <form action={logout}>
              <button
                type="submit"
                className="rounded-lg px-2.5 py-2.5 text-muted hover:bg-canvas hover:text-ink sm:px-3"
                title={user.email}
              >
                יציאה
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
