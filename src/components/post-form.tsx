"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { CHANNELS, CHANNEL_LABELS } from "@/lib/campaigns";
import type { FormAction, FormState } from "@/components/action-form";

type Suggest = (input: {
  campaignId: string;
  channel: string;
  productId: string | null;
  brief: string;
}) => Promise<{ text: string } | { error: string }>;

/** New post for a campaign. The AI button fills the text box; the user edits and saves. */
export function PostForm({
  campaignId,
  products,
  defaultDate,
  aiEnabled,
  action,
  suggest,
}: {
  campaignId: string;
  products: { id: string; name: string }[];
  defaultDate: string;
  aiEnabled: boolean;
  action: FormAction;
  suggest: Suggest;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [body, setBody] = useState("");
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggesting, startSuggesting] = useTransition();
  const [state, formAction, pending] = useActionState(async (previous: FormState, formData: FormData) => {
    const result = await action(previous, formData);
    if (result?.ok) {
      setBody("");
    }
    return result;
  }, null);

  const askForSuggestion = () => {
    if (!form.current) return;
    const data = new FormData(form.current);
    setSuggestError(null);
    startSuggesting(async () => {
      const result = await suggest({
        campaignId,
        channel: String(data.get("channel") ?? ""),
        productId: String(data.get("product_id") ?? "") || null,
        brief: String(data.get("brief") ?? ""),
      });
      if ("error" in result) {
        setSuggestError(result.error);
      } else {
        setBody(result.text);
      }
    });
  };

  return (
    <form ref={form} action={formAction} className="grid gap-4 sm:grid-cols-3">
      <input type="hidden" name="campaign_id" value={campaignId} />
      <label>
        <span className="label">ערוץ</span>
        <select name="channel" defaultValue="instagram" className="field">
          {CHANNELS.map((channel) => (
            <option key={channel} value={channel}>{CHANNEL_LABELS[channel]}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="label">מתוכנן לתאריך</span>
        <input type="date" name="scheduled_for" defaultValue={defaultDate} className="field" />
      </label>
      <label>
        <span className="label">מוצר (לא חובה)</span>
        <select name="product_id" defaultValue="" className="field">
          <option value="">בלי מוצר מסוים</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>{product.name}</option>
          ))}
        </select>
      </label>

      {aiEnabled && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg bg-canvas p-3 sm:col-span-3">
          <label className="min-w-0 flex-1 basis-64">
            <span className="label">על מה הפוסט? (לא נשמר, רק להצעת הטקסט)</span>
            <input name="brief" maxLength={500} placeholder="למשל: קולקציה חדשה הגיעה, מתאים למתנה לחג" className="field" />
          </label>
          <button type="button" onClick={askForSuggestion} disabled={suggesting} className="btn-quiet">
            {suggesting ? "כותב הצעה…" : body ? "הצעה אחרת" : "הצעת טקסט ב-AI"}
          </button>
          <p aria-live="polite" className="basis-full text-sm text-muted">
            {suggestError ? (
              <span className="text-danger">{suggestError}</span>
            ) : (
              "קראו ותקנו את ההצעה לפני השמירה."
            )}
          </p>
        </div>
      )}

      <label className="sm:col-span-3">
        <span className="label">טקסט הפוסט</span>
        <textarea
          name="body"
          required
          rows={6}
          maxLength={5000}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className="field"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "רק רגע…" : "שמירת הפוסט"}
        </button>
        <p aria-live="polite" className={`text-sm empty:hidden ${state?.error ? "text-danger" : "text-accent"}`}>
          {state?.error ?? state?.ok}
        </p>
      </div>
    </form>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-quiet"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch {
          setCopied(false);
        }
      }}
    >
      <span aria-live="polite">{copied ? "הועתק" : "העתקת הטקסט"}</span>
    </button>
  );
}
