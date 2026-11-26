"use client";

import { useActionState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export type FormState = { error?: string; ok?: string } | null;
export type FormAction = (state: FormState, formData: FormData) => Promise<FormState>;

export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "רק רגע…",
  submitClassName = "btn",
  className,
}: {
  action: FormAction;
  children?: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  submitClassName?: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className={className}>
      {children}
      <button type="submit" className={submitClassName} disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        <span>{pending ? pendingLabel : submitLabel}</span>
      </button>
      <div aria-live="polite" className="basis-full empty:hidden">
        {state?.error && (
          <p className="mt-1 inline-flex items-center gap-2 rounded-xl border border-danger/25 bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            <span>{state.error}</span>
          </p>
        )}
        {state?.ok && !state.error && (
          <p className="mt-1 inline-flex items-center gap-2 rounded-xl border border-accent/25 bg-accent-soft px-3 py-2 text-sm font-medium text-accent-strong">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden />
            <span>{state.ok}</span>
          </p>
        )}
      </div>
    </form>
  );
}
