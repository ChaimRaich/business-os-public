"use client";

import { useActionState, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  KeyRound,
  Landmark,
  Loader2,
  Megaphone,
  Rocket,
  ShieldAlert,
  Store,
} from "lucide-react";
import Link from "next/link";
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
  canManage: boolean;
  /** Whether the wizard was already finished or skipped for this business. */
  completed: boolean;
  integrations: SavedIntegration[];
};

export function OnboardingWizard({ canManage, completed, integrations }: Props) {
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
    <div className="flex flex-col gap-6">
        {/* Intro & Progress */}
        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-3xl sm:text-4xl">חיבור מערכות העסק</h1>
            <div className="flex items-center gap-3">
              <div className="h-2 w-28 overflow-hidden rounded-full bg-line" aria-hidden>
                <div
                  className="h-full rounded-full bg-accent transition-all duration-300"
                  style={{ width: `${(readyCount / INTEGRATION_CATEGORIES.length) * 100}%` }}
                />
              </div>
              <span className="text-sm font-bold tabular-nums text-accent-strong">
                <span className="sr-only">מחוברות: </span>
                {readyCount}/{INTEGRATION_CATEGORIES.length}
              </span>
            </div>
          </div>

          {/* Stepper Tabs */}
          <div className="mt-6 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {INTEGRATION_CATEGORIES.map((category) => {
              const Icon = CATEGORY_ICONS[category.id];
              const saved = byCategory.get(category.id);
              const ready = isIntegrationReady(saved?.status);
              const selected = activeCategory === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setActiveCategory(category.id)}
                  aria-pressed={selected}
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
                        ? "bg-accent text-(--btn-fg)"
                        : selected
                          ? "bg-accent-soft text-accent-strong"
                          : "bg-surface text-muted"
                    }`}
                  >
                    {ready ? <CheckCircle2 className="size-4.5" aria-hidden /> : <Icon className="size-4.5" aria-hidden />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink">{category.shortTitle}</span>
                    {saved && (
                      <span className={`block truncate text-[11px] ${ready ? "font-semibold text-accent-strong" : "text-muted"}`}>
                        {saved.display_name}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Active Step Configuration */}
        {!canManage ? (
          <p className="card flex items-center gap-2.5 text-sm text-muted">
            <ShieldAlert className="size-4.5 shrink-0 text-warning" aria-hidden />
            <span>רק בעלים או מנהל יכולים לחבר מערכות.</span>
          </p>
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

        {/* Finish or skip: the wizard never blocks the workspace. */}
        <div className="flex flex-wrap items-center justify-end gap-3">
          {completeState?.error && (
            <p className="me-auto inline-flex items-center gap-1.5 text-sm font-medium text-danger">
              <AlertCircle className="size-4" aria-hidden />
              <span>{completeState.error}</span>
            </p>
          )}
          <Link href="/integrations" className="btn-quiet">
            כל האינטגרציות
          </Link>
          {canManage && !completed && (
            <form action={completeAction}>
              <button type="submit" className={allReady ? "btn px-6" : "btn-quiet"} disabled={completing}>
                {completing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Rocket className="size-4" aria-hidden />}
                <span>{completing ? "שומר…" : allReady ? "סיום ההקמה" : "דילוג"}</span>
              </button>
            </form>
          )}
        </div>
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
          <p className="label mb-2.5">מערכת</p>
          <div className="flex flex-wrap gap-2">
            {category.providers.map((provider) => {
              const active = provider.id === providerId;
              return (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => setProviderId(provider.id)}
                  aria-pressed={active}
                  className={`min-h-11 cursor-pointer rounded-xl border px-4 text-sm font-semibold transition-all ${
                    active
                      ? "border-accent bg-accent-soft/55 text-ink ring-2 ring-accent/20"
                      : "border-line bg-surface-subtle/35 text-muted hover:border-line-strong hover:text-ink"
                  }`}
                >
                  {provider.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="card-subtle flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-muted">מצב</span>
            <button
              type="button"
              onClick={() => setMode("live")}
              aria-pressed={mode === "live"}
              className={`cursor-pointer rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all ${
                mode === "live"
                  ? "border-accent bg-accent text-(--btn-fg)"
                  : "border-line bg-surface text-muted hover:text-ink"
              }`}
            >
              חיבור חי
            </button>
            <button
              type="button"
              onClick={() => setMode("sandbox")}
              aria-pressed={mode === "sandbox"}
              className={`cursor-pointer rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all ${
                mode === "sandbox"
                  ? "border-accent bg-accent text-(--btn-fg)"
                  : "border-line bg-surface text-muted hover:text-ink"
              }`}
            >
              ידני
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
                  <span>מפתח API</span>
                </label>
                <input
                  className="field font-mono text-sm"
                  id={`key-${category.id}`}
                  name="api_key"
                  type="password"
                  dir="ltr"
                  autoComplete="off"
                  placeholder={saved?.credential_hint ? `שמור (${saved.credential_hint})` : ""}
                />
                <p className="mt-1 text-[11px] text-muted">
                  נשמרות רק 4 הספרות האחרונות.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CheckCircle2 className="size-4" aria-hidden />}
            <span>{pending ? "שומר…" : "שמירה"}</span>
          </button>
          {state?.ok && (
            <button type="button" className="btn-quiet" onClick={onSavedNext}>
              לשלב הבא
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
