"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  FileUp,
  Landmark,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Package,
  PlugZap,
  Plus,
  Settings,
  Truck,
  Users,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { BusinessSwitcher } from "@/components/business-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV_GROUPS = [
  {
    label: "תפעול ומלאי",
    items: [
      { href: "/", label: "ראשי", icon: LayoutDashboard, exact: true },
      { href: "/receiving", label: "קליטת סחורה", icon: FileUp },
      { href: "/products", label: "מוצרים", icon: Package },
      { href: "/suppliers", label: "ספקים", icon: Truck },
    ],
  },
  {
    label: "כספים וצמיחה",
    items: [
      { href: "/finance", label: "הנה״ח וחשבונות", icon: Landmark },
      { href: "/campaigns", label: "קמפיינים ושיווק", icon: Megaphone },
      { href: "/crm", label: "לקוחות ו-CRM", icon: Users },
    ],
  },
  {
    label: "מערכת",
    items: [
      { href: "/integrations", label: "אינטגרציות", icon: PlugZap },
      { href: "/settings", label: "הגדרות", icon: Settings },
    ],
  },
] as const;

const MOBILE_TABS = [
  { href: "/", label: "ראשי", icon: LayoutDashboard, exact: true },
  { href: "/receiving", label: "קליטה", icon: FileUp },
  { href: "/finance", label: "כספים", icon: Landmark },
  { href: "/campaigns", label: "קמפיינים", icon: Megaphone },
  { href: "/integrations", label: "אינטגרציות", icon: PlugZap },
] as const;

const MOBILE_SUBLINKS = [
  { href: "/products", label: "מוצרים" },
  { href: "/suppliers", label: "ספקים" },
  { href: "/crm", label: "CRM" },
  { href: "/settings", label: "הגדרות" },
] as const;

type Props = {
  userEmail: string;
  roleLabel: string;
  activeBusiness: { id: string; name: string };
  businesses: { id: string; name: string }[];
  switchBusiness: (formData: FormData) => Promise<void>;
  logout: () => Promise<void>;
  children: React.ReactNode;
};

export function AppShell({
  userEmail,
  roleLabel,
  activeBusiness,
  businesses,
  switchBusiness,
  logout,
  children,
}: Props) {
  const pathname = usePathname();
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const initial = (userEmail.trim()[0] ?? "U").toUpperCase();

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      {/* Desktop RTL Sidebar */}
      <aside className="hidden md:sticky md:top-0 md:flex md:h-screen md:w-68 md:shrink-0 md:flex-col md:border-e md:border-line md:bg-surface">
        <div className="flex flex-col gap-4 border-b border-line p-5">
          <Link href="/" className="transition-opacity hover:opacity-90">
            <BrandMark />
          </Link>
          {businesses.length > 1 ? (
            <BusinessSwitcher action={switchBusiness} activeId={activeBusiness.id} businesses={businesses} />
          ) : (
            <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-subtle/70 px-3 py-2.5">
              <Building2 className="size-4 shrink-0 text-accent" aria-hidden />
              <span className="truncate text-sm font-semibold text-ink">{activeBusiness.name}</span>
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
          <Link href="/receiving/new" className="btn w-full justify-center">
            <Plus className="size-4" aria-hidden />
            <span>קליטה חדשה</span>
          </Link>

          <nav aria-label="ניווט ראשי" className="flex flex-col gap-5">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="flex flex-col gap-1">
                <p className="px-3 pb-1 text-[11px] font-bold tracking-wider text-muted/80">{group.label}</p>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href, "exact" in item ? item.exact : false);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all ${
                        active
                          ? "bg-accent-soft font-semibold text-accent-strong"
                          : "text-muted hover:bg-surface-subtle hover:text-ink"
                      }`}
                    >
                      <Icon className={`size-4.5 shrink-0 ${active ? "text-accent" : ""}`} aria-hidden />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-3 border-t border-line p-4">
          <div className="flex items-center gap-3 rounded-xl bg-surface-subtle/60 px-3 py-2.5">
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent-strong">
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-ink" dir="ltr">
                {userEmail}
              </p>
              <p className="text-[11px] text-muted">{roleLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle className="flex-1" showLabel />
            <form action={logout}>
              <button
                type="submit"
                title="יציאה מהחשבון"
                aria-label="יציאה מהחשבון"
                className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-xl border border-line bg-surface px-3 text-muted transition-all hover:border-danger/40 hover:bg-danger-soft hover:text-danger"
              >
                <LogOut className="size-4" aria-hidden />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-md md:hidden">
        <div className="flex items-center gap-2 px-4 py-3">
          <Link href="/" className="shrink-0">
            <BrandMark compact />
          </Link>
          <div className="min-w-0 flex-1">
            {businesses.length > 1 ? (
              <BusinessSwitcher action={switchBusiness} activeId={activeBusiness.id} businesses={businesses} />
            ) : (
              <span className="block truncate ps-1 text-xs font-medium text-muted">{activeBusiness.name}</span>
            )}
          </div>
          <ThemeToggle className="px-2.5" />
          <form action={logout}>
            <button
              type="submit"
              title="יציאה"
              aria-label="יציאה מהחשבון"
              className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-xl border border-line bg-surface px-2.5 text-muted hover:bg-danger-soft hover:text-danger"
            >
              <LogOut className="size-4" aria-hidden />
            </button>
          </form>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto border-t border-line/70 px-4 py-1.5 text-xs">
          {MOBILE_SUBLINKS.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`shrink-0 rounded-full px-3 py-1 font-medium transition-colors ${
                  active ? "bg-accent-soft font-semibold text-accent-strong" : "text-muted hover:bg-surface-subtle hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-24 sm:px-6 md:px-8 md:py-8">
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav
        aria-label="ניווט תחתון"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/92 px-2 py-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] backdrop-blur-md md:hidden"
      >
        <ul className="grid grid-cols-5 gap-1">
          {MOBILE_TABS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href, "exact" in item ? item.exact : false);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-[11px] font-medium transition-colors ${
                    active ? "bg-accent-soft font-semibold text-accent-strong" : "text-muted hover:text-ink"
                  }`}
                >
                  <Icon className="size-4.5" aria-hidden />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
