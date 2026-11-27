"use client";

import { useActionState, type ReactNode } from "react";

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
        {pending ? pendingLabel : submitLabel}
      </button>
      <p
        aria-live="polite"
        className={`basis-full text-sm empty:hidden ${state?.error ? "text-danger" : "text-accent"}`}
      >
        {state?.error ?? state?.ok}
      </p>
    </form>
  );
}
