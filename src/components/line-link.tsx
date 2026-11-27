"use client";

import { useState, useTransition } from "react";
import { linkLineToVariant, searchVariants, type VariantChoice } from "@/app/(app)/receiving/link-actions";

/** "Link to an existing product" for a document line the catalog did not recognise. */
export function LineLink({ documentId, lineId, suggestion }: { documentId: string; lineId: string; suggestion: string }) {
  const [query, setQuery] = useState(suggestion);
  const [choices, setChoices] = useState<VariantChoice[] | null>(null);
  const [message, setMessage] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const search = () =>
    startTransition(async () => {
      setMessage(null);
      setChoices(await searchVariants(query));
    });
  const link = (variantId: string) =>
    startTransition(async () => {
      setMessage(await linkLineToVariant(documentId, lineId, variantId));
    });

  return (
    <details className="basis-full">
      <summary className="flex min-h-11 cursor-pointer items-center text-accent underline-offset-4 hover:underline">
        שיוך למוצר קיים
      </summary>
      <div className="mt-1 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-56">
          <label className="mb-1 block text-xs text-muted" htmlFor={`link-${lineId}`}>חיפוש בקטלוג</label>
          <input
            className="field px-2 py-2 text-sm"
            id={`link-${lineId}`}
            type="search"
            value={query}
            placeholder="שם מוצר, ברקוד או מק״ט"
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                search();
              }
            }}
          />
        </div>
        <button type="button" className="btn-quiet" disabled={pending || query.trim().length < 2} onClick={search}>
          {pending ? "רק רגע…" : "חיפוש"}
        </button>
      </div>
      {choices && (
        <ul className="mt-2 flex flex-col gap-1">
          {choices.length === 0 && <li className="text-muted">לא נמצאו מוצרים. נסו מילה אחרת.</li>}
          {choices.map((choice) => (
            <li key={choice.variantId}>
              <button
                type="button"
                className="flex min-h-11 w-full flex-wrap items-center gap-x-3 rounded-lg border border-line px-3 text-start hover:bg-canvas disabled:opacity-60"
                disabled={pending}
                onClick={() => link(choice.variantId)}
              >
                <span className="font-medium text-ink">{choice.title}</span>
                {choice.supplier && <span className="text-muted">{choice.supplier}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p aria-live="polite" className={`mt-2 empty:hidden ${message?.error ? "text-danger" : "text-accent"}`}>
        {message?.error ?? message?.ok}
      </p>
    </details>
  );
}
