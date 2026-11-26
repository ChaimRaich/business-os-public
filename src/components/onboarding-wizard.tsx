"use client";

import { useActionState, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  KeyRound,
  Landmark,
  Loader2,
  LogOut,
  Megaphone,
  PlugZap,
  Rocket,
  ShieldAlert,
  Store,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { BusinessSwitcher } from "@/components/business-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  INTEGRATION_CATEGORIES,
  INTEGRATION_STATUS_LABELS,
  isIntegrationReady,
  type IntegrationCategory,
  type IntegrationStatus,
} from "@/lib/integrations";
import { completeOnboarding, saveIntegration } from "@/app/(app)/integrations/actions";

export type SavedIntegration = {
  id: string;
  category: IntegrationCategory;
  provider: string;
  display_name: string;
  status: IntegrationStatus;
  mode: string;
  account_ref: string | null;
  credential_hint: string | null;
  last_synced_at: string | null;
};

const CATEGORY_ICONS: Record<IntegrationCategory, typeof Store> = {
  pos_commerce: Store,
  accounting: Landmark,
  payments: CreditCard,
  marketing_crm: Megaphone,
};

type Props = {
  businessName: string;
  activeBusinessId: string;
  businesses: { id: string; name: string }[];
  userEmail: string;
  canManage: boolean;
  integrations: SavedIntegration[];
  switchBusiness: (formData: FormData) => Promise<void>;
  logout: () => Promise<void>;
};

export function OnboardingWizard({
  businessName,
  activeBusinessId,
  businesses,
  userEmail,
  canManage,
  integrations,
  switchBusiness,
  logout,
}: Props) {
  const byCategory = new Map(integrations.map((row) => [row.category, row]));
  const firstPending =
    INTEGRATION_CATEGORIES.find((cat) => !isIntegrationReady(byCategory.get(cat.id)?.status))?.id ??
    INTEGRATION_CATEGORIES[0].id;

  const [activeCategory, setActiveCategory] = useState<IntegrationCategory>(firstPending);
  const readyCount = INTEGRATION_CATEGORIES.filter((cat) => isIntegrationReady(byCategory.get(cat.id)?.status)).length;
  const allReady = readyCount === INTEGRATION_CATEGORIES.length;

  const currentMeta = INTEGRATION_CATEGORIES.find((cat) => cat.id === activeCategory) ?? INTEGRATION_CATEGORIES[0];
  const currentSaved = byCategory.get(activeCategory);

  const [completeState, completeAction, completing] = useActionState(completeOnboarding, null);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandMark compact />
            <span className="hidden h-5 w-px bg-line sm:inline-block" aria-hidden />
            {businesses.length > 1 ? (
              <div className="w-44 sm:w-56">
                <BusinessSwitcher action={switchBusiness} activeId={activeBusinessId} businesses={businesses} />
              </div>
            ) : (
              <span className="hidden text-sm font-semibold text-ink sm:inline">{businessName}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted md:inline" dir="ltr">
              {userEmail}
            </span>
            <ThemeToggle />
            <form action={logout}>
              <button
                type="submit"
                title="יציאה מהחשבון"
                aria-label="יציאה מהחשבון"
                className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-xl border border-line bg-surface px-3 text-muted hover:bg-danger-soft hover:text-danger"
              >
                <LogOut className="size-4" aria-hidden />
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        {/* Intro & Progress */}
        <section className="card">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <span className="badge mb-3 bg-accent-soft text-accent-strong">
                <PlugZap className="size-3.5" aria-hidden />
                <span>אתחול מערכת Business OS · {businessName}</span>
              </span>
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                חיבור אינטגרציות לניהול העסק מקצה לקצה
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                כדי שהמערכת תנהל את העסק בצורה אחידה — קופה ומלאי, הנהלת חשבונות ורו״ח, סליקה ובנקים, וקמפיינים ו-CRM — יש להגדיר חיבור לכל אחת מ-4 הקטגוריות (חיבור חי או מצב Sandbox/ידני להתחלה מהירה).
              </p>
            </div>
            <div className="min-w-44 rounded-2xl border border-line bg-surface-subtle/60 p-4 text-center">
              <span className="block text-3xl font-extrabold tabular-nums text-accent">
                {readyCount}/{INTEGRATION_CATEGORIES.length}
              </span>
              <span className="mt-0.5 block text-xs font-medium text-muted">אינטגרציות מוכנות</span>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-300"
                  style={{ width: `${(readyCount / INTEGRATION_CATEGORIES.length) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Stepper Tabs */}
          <div className="mt-6 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {INTEGRATION_CATEGORIES.map((category, index) => {
              const Icon = CATEGORY_ICONS[category.id];
              const saved = byCategory.get(category.id);
              const ready = isIntegrationReady(saved?.status);
              const selected = activeCategory === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setActiveCategory(category.id)}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 text-right transition-all ${
                    selected
                      ? "border-accent bg-accent-soft/60 shadow-xs"
                      : ready
                        ? "border-accent/30 bg-surface hover:border-accent/60"
                        : "border-line bg-surface-subtle/40 hover:border-line-strong"
                  }`}
                >
                  <span
                    className={`inline-flex size-9 shrink-0 items-center justify-center rounded-xl ${
                      ready
                        ? "bg-accent text-white dark:text-[#041815]"
                        : selected
                          ? "bg-accent-soft text-accent-strong"
                          : "bg-surface text-muted"
                    }`}
                  >
                    {ready ? <CheckCircle2 className="size-4.5" aria-hidden /> : <Icon className="size-4.5" aria-hidden />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-semibold text-muted">שלב {index + 1}</span>
                    <span className="block truncate text-sm font-bold text-ink">{category.shortTitle}</span>
                    <span className={`block truncate text-[11px] ${ready ? "font-semibold text-accent-strong" : "text-muted"}`}>
                      {saved ? saved.display_name : "טרם הוגדר"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Active Step Configuration */}
        {!canManage ? (
          <section className="card border-warning-border/50 bg-warning-soft/50">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
              <div>
                <h2 className="font-bold text-ink">ממתינים להשלמת האתחול על ידי בעל העסק או מנהל</h2>
                <p className="mt-1 text-sm text-muted">
                  התפקיד שלך בעסק הוא עובד. רק בעלים או מנהל יכולים לחבר את אינטגרציות הליבה ולאשר את פתיחת סביבת העבודה.
                </p>
              </div>
            </div>
          </section>
        ) : (
          <CategoryConfigForm
            key={`${currentMeta.id}-${currentSaved?.last_synced_at ?? currentSaved?.provider ?? "new"}`}
            category={currentMeta}
            saved={currentSaved}
            onSavedNext={() => {
              const next = INTEGRATION_CATEGORIES.find(
                (cat) => cat.id !== currentMeta.id && !isIntegrationReady(byCategory.get(cat.id)?.status),
              );
              if (next) {
                setActiveCategory(next.id);
              }
            }}
          />
        )}

        {/* Complete Onboarding Footer */}
        <section className={`card flex flex-wrap items-center justify-between gap-4 ${allReady ? "border-accent bg-accent-soft/40" : ""}`}>
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-ink">
              <Rocket className={`size-4.5 ${allReady ? "text-accent" : "text-muted"}`} aria-hidden />
              <span>{allReady ? "כל האינטגרציות מוכנות — אפשר להיכנס למערכת!" : "כניסה לסביבת העבודה"}</span>
            </h2>
            <p className="mt-1 text-sm text-muted">
              {allReady
                ? "כל 4 קטגוריות הליבה הוגדרו. לחצו כדי להשלים את האתחול ולפתוח את הדאשבורד וכל המודולים."
                : `נותרו עוד ${INTEGRATION_CATEGORIES.length - readyCount} קטגוריות להגדרה לפני שניתן להפעיל את העסק.`}
            </p>
            {completeState?.error && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-danger">
                <AlertCircle className="size-4" aria-hidden />
                <span>{completeState.error}</span>
              </p>
            )}
          </div>
          {canManage && (
            <form action={completeAction}>
              <button type="submit" className="btn px-6" disabled={!allReady || completing}>
                {completing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Rocket className="size-4" aria-hidden />}
                <span>{completing ? "מפעיל את העסק…" : "סיום אתחול וכניסה למערכת"}</span>
              </button>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}

function CategoryConfigForm({
  category,
  saved,
  onSavedNext,
}: {
  category: (typeof INTEGRATION_CATEGORIES)[number];
  saved?: SavedIntegration;
  onSavedNext: () => void;
}) {
  const [providerId, setProviderId] = useState(saved?.provider ?? category.providers[0].id);
  const [mode, setMode] = useState<"live" | "sandbox">(saved?.mode === "live" ? "live" : "sandbox");
  const [state, formAction, pending] = useActionState(saveIntegration, null);

  const selectedProvider = category.providers.find((p) => p.id === providerId) ?? category.providers[0];
  const Icon = CATEGORY_ICONS[category.id];

  return (
    <section className="card">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="flex items-start gap-3">
          <span className="icon-box mt-0.5">
            <Icon className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-lg font-extrabold text-ink">{category.title}</h2>
            <p className="mt-0.5 text-sm text-muted">{category.description}</p>
            <p className="mt-1 text-xs font-medium text-accent-strong">נדרש עבור: {category.requiredFor}</p>
          </div>
        </div>
        {saved && (
          <span className={`badge ${isIntegrationReady(saved.status) ? "bg-accent-soft text-accent-strong" : "bg-surface-subtle text-muted"}`}>
            {INTEGRATION_STATUS_LABELS[saved.status]}
          </span>
        )}
      </div>

      <form action={formAction} className="flex flex-col gap-5">
        <input type="hidden" name="category" value={category.id} />
        <input type="hidden" name="provider" value={providerId} />
        <input type="hidden" name="mode" value={mode} />

        <div>
          <p className="label mb-2.5">בחרו מערכת / ספק לחיבור</p>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {category.providers.map((provider) => {
              const active = provider.id === providerId;
              return (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => setProviderId(provider.id)}
                  className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-3.5 text-right transition-all ${
                    active
                      ? "border-accent bg-accent-soft/55 ring-2 ring-accent/20"
                      : "border-line bg-surface-subtle/35 hover:border-line-strong"
                  }`}
                >
                  <span className="text-sm font-bold text-ink">{provider.name}</span>
                  <span className="text-xs leading-relaxed text-muted">{provider.description}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="card-subtle flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-muted">מצב הפעלה:</span>
            <button
              type="button"
              onClick={() => setMode("live")}
              className={`cursor-pointer rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all ${
                mode === "live"
                  ? "border-accent bg-accent text-white dark:text-[#041815]"
                  : "border-line bg-surface text-muted hover:text-ink"
              }`}
            >
              חיבור חי (חשבון / API פעיל)
            </button>
            <button
              type="button"
              onClick={() => setMode("sandbox")}
              className={`cursor-pointer rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all ${
                mode === "sandbox"
                  ? "border-accent bg-accent text-white dark:text-[#041815]"
                  : "border-line bg-surface text-muted hover:text-ink"
              }`}
            >
              Sandbox / עבודה ידנית (להתחלה מהירה)
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor={`account-${category.id}`}>
                {selectedProvider.accountLabel}
              </label>
              <input
                className="field"
                id={`account-${category.id}`}
                name="account_ref"
                defaultValue={saved?.provider === providerId ? (saved.account_ref ?? "") : ""}
                placeholder={selectedProvider.accountPlaceholder}
              />
            </div>

            {selectedProvider.supportsLiveKey && mode === "live" && (
              <div>
                <label className="label flex items-center gap-1.5" htmlFor={`key-${category.id}`}>
                  <KeyRound className="size-3.5 text-accent" aria-hidden />
                  <span>מפתח API / Token</span>
                </label>
                <input
                  className="field font-mono text-sm"
                  id={`key-${category.id}`}
                  name="api_key"
                  type="password"
                  dir="ltr"
                  autoComplete="off"
                  placeholder={saved?.credential_hint ? `שמור (${saved.credential_hint})` : "הזינו מפתח חיבור…"}
                />
                <p className="mt-1 text-[11px] text-muted">
                  המערכת שומרת רק חתימת זיהוי מוסתרת (4 ספרות אחרונות) לאימות החיבור.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CheckCircle2 className="size-4" aria-hidden />}
            <span>{pending ? "שומר חיבור…" : `שמירת ${category.shortTitle}`}</span>
          </button>
          {state?.ok && (
            <button type="button" className="btn-quiet" onClick={onSavedNext}>
              מעבר לשלב הבא
            </button>
          )}
          <div aria-live="polite" className="empty:hidden">
            {state?.error && (
              <p className="inline-flex items-center gap-1.5 text-sm font-medium text-danger">
                <AlertCircle className="size-4 shrink-0" aria-hidden />
                <span>{state.error}</span>
              </p>
            )}
            {state?.ok && !state.error && (
              <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-strong">
                <CheckCircle2 className="size-4 shrink-0" aria-hidden />
                <span>{state.ok}</span>
              </p>
            )}
          </div>
        </div>
      </form>
    </section>
  );
}
