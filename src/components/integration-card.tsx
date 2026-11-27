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
  RefreshCw,
  Settings2,
  Store,
} from "lucide-react";
import {
  INTEGRATION_STATUS_LABELS,
  isIntegrationReady,
  type IntegrationCategory,
  type IntegrationCategoryMeta,
} from "@/lib/integrations";
import type { SavedIntegration } from "@/components/onboarding-wizard";
import { saveIntegration, syncIntegration } from "@/app/(app)/integrations/actions";
import { formatDateTime } from "@/lib/suite";

const ICONS: Record<IntegrationCategory, typeof Store> = {
  pos_commerce: Store,
  accounting: Landmark,
  payments: CreditCard,
  marketing_crm: Megaphone,
};

export function IntegrationCard({
  category,
  saved,
  canManage,
}: {
  category: IntegrationCategoryMeta;
  saved?: SavedIntegration;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(!saved);
  const [providerId, setProviderId] = useState(saved?.provider ?? category.providers[0].id);
  const [mode, setMode] = useState<"live" | "sandbox">(saved?.mode === "live" ? "live" : "sandbox");
  const [saveState, saveAction, saving] = useActionState(saveIntegration, null);
  const [syncState, syncAction, syncing] = useActionState(syncIntegration, null);

  const Icon = ICONS[category.id];
  const ready = isIntegrationReady(saved?.status);
  const selectedProvider = category.providers.find((p) => p.id === providerId) ?? category.providers[0];

  return (
    <section className="card flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className={`icon-box mt-0.5 ${ready ? "" : "bg-surface-subtle text-muted"}`}>
            <Icon className="size-5" aria-hidden />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-ink">{category.title}</h2>
              <span
                className={`badge ${
                  saved?.status === "connected"
                    ? "bg-accent-soft text-accent-strong"
                    : saved?.status === "sandbox"
                      ? "bg-warning-soft text-warning"
                      : saved?.status === "error"
                        ? "bg-danger-soft text-danger"
                        : "bg-surface-subtle text-muted"
                }`}
              >
                {saved ? INTEGRATION_STATUS_LABELS[saved.status] : "לא מחובר"}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted">{category.description}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {saved && canManage && (
            <form action={syncAction}>
              <input type="hidden" name="id" value={saved.id} />
              <button type="submit" className="btn-quiet min-h-9 px-3 text-xs" disabled={syncing}>
                <RefreshCw className={`size-3.5 ${syncing ? "animate-spin" : ""}`} aria-hidden />
                <span>{syncing ? "מסנכרן…" : "סנכרון"}</span>
              </button>
            </form>
          )}
          {canManage && (
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="btn-quiet min-h-9 px-3 text-xs"
            >
              <Settings2 className="size-3.5" aria-hidden />
              <span>{editing ? "סגירה" : "הגדרות חיבור"}</span>
            </button>
          )}
        </div>
      </div>

      {saved && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-xl bg-surface-subtle/60 px-4 py-2.5 text-xs">
          <span>
            <span className="text-muted">ספק פעיל: </span>
            <strong className="font-semibold text-ink">{saved.display_name}</strong>
          </span>
          {saved.account_ref && (
            <span>
              <span className="text-muted">מזהה חשבון: </span>
              <bdi dir="ltr" className="font-mono font-medium text-ink">{saved.account_ref}</bdi>
            </span>
          )}
          {saved.credential_hint && (
            <span>
              <span className="text-muted">מפתח: </span>
              <bdi dir="ltr" className="font-mono text-ink">{saved.credential_hint}</bdi>
            </span>
          )}
          {saved.last_synced_at && (
            <span className="ms-auto text-muted">עודכן: {formatDateTime(saved.last_synced_at)}</span>
          )}
        </div>
      )}

      {syncState?.ok && (
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-strong">
          <CheckCircle2 className="size-3.5" aria-hidden />
          <span>{syncState.ok}</span>
        </p>
      )}
      {syncState?.error && (
        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-danger">
          <AlertCircle className="size-3.5" aria-hidden />
          <span>{syncState.error}</span>
        </p>
      )}

      {editing && canManage && (
        <form action={saveAction} className="card-subtle flex flex-col gap-4">
          <input type="hidden" name="category" value={category.id} />
          <input type="hidden" name="mode" value={mode} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor={`provider-${category.id}`}>ספק</label>
              <select
                className="field min-h-11"
                id={`provider-${category.id}`}
                name="provider"
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
              >
                {category.providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <span className="label">מצב חיבור</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode("live")}
                  className={`min-h-11 cursor-pointer rounded-xl border text-xs font-semibold transition-all ${
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
                  className={`min-h-11 cursor-pointer rounded-xl border text-xs font-semibold transition-all ${
                    mode === "sandbox"
                      ? "border-accent bg-accent text-(--btn-fg)"
                      : "border-line bg-surface text-muted hover:text-ink"
                  }`}
                >
                  ידני
                </button>
              </div>
            </div>

            <div>
              <label className="label" htmlFor={`ref-${category.id}`}>{selectedProvider.accountLabel}</label>
              <input
                className="field"
                id={`ref-${category.id}`}
                name="account_ref"
                defaultValue={saved?.provider === providerId ? (saved.account_ref ?? "") : ""}
                placeholder={selectedProvider.accountPlaceholder}
              />
            </div>

            {selectedProvider.supportsLiveKey && mode === "live" && (
              <div>
                <label className="label flex items-center gap-1.5" htmlFor={`apikey-${category.id}`}>
                  <KeyRound className="size-3.5 text-accent" aria-hidden />
                  <span>מפתח API</span>
                </label>
                <input
                  className="field font-mono text-sm"
                  id={`apikey-${category.id}`}
                  name="api_key"
                  type="password"
                  dir="ltr"
                  autoComplete="off"
                  placeholder={saved?.credential_hint ? `שמור (${saved.credential_hint})` : "הזינו מפתח חדש…"}
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
              <span>{saving ? "שומר…" : "שמירת הגדרות"}</span>
            </button>
            {saveState?.error && (
              <p className="inline-flex items-center gap-1.5 text-xs font-medium text-danger">
                <AlertCircle className="size-3.5" aria-hidden />
                <span>{saveState.error}</span>
              </p>
            )}
            {saveState?.ok && (
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-strong">
                <CheckCircle2 className="size-3.5" aria-hidden />
                <span>{saveState.ok}</span>
              </p>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
