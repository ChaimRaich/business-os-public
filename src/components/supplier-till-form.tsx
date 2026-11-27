"use client";

import { useState, useTransition } from "react";
import { saveSupplierTillDetails } from "@/app/(app)/suppliers/actions";

type Values = {
  pos_code: string;
  pos_name: string;
  pos_barcode_source: string;
  pos_next_barcode: string;
  price_mode: string;
  price_multiplier: string;
};

/**
 * What the till needs to know about a supplier, asked on the till-file screen.
 * The fields are held here so that a rejected save keeps what was typed.
 */
export function SupplierTillForm({ supplierId, initial }: { supplierId: string; initial: Values }) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const internal = values.pos_barcode_source === "internal";
  const byMultiplier = values.price_mode === "multiplier";

  const set = (key: keyof Values) => (event: { target: { value: string } }) => {
    setError(null);
    setValues((current) => ({ ...current, [key]: event.target.value }));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const formData = new FormData();
    formData.set("id", supplierId);
    for (const [key, value] of Object.entries(values)) formData.set(key, value);
    if (!internal) formData.set("pos_next_barcode", initial.pos_next_barcode);
    startTransition(async () => {
      const result = await saveSupplierTillDetails(null, formData);
      setError(result?.error ?? null);
    });
  };

  return (
    <form onSubmit={submit} className="mt-3 grid gap-4 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="till-supplier-code">קוד הספק בקופה</label>
        <input className="field" id="till-supplier-code" dir="ltr" placeholder="12" value={values.pos_code} onChange={set("pos_code")} required />
      </div>
      <div>
        <label className="label" htmlFor="till-supplier-name">שם הספק בקופה</label>
        <input className="field" id="till-supplier-name" placeholder="נובה" value={values.pos_name} onChange={set("pos_name")} required />
      </div>
      <div>
        <label className="label" htmlFor="till-barcode-source">איזה ברקוד נכנס לקופה</label>
        <select className="field min-h-11" id="till-barcode-source" value={values.pos_barcode_source} onChange={set("pos_barcode_source")}>
          <option value="internal">ברקוד פנימי של החנות</option>
          <option value="supplier">הברקוד או קוד הפריט של הספק</option>
        </select>
      </div>
      {internal && (
        <div>
          <label className="label" htmlFor="till-next-barcode">הברקוד הפנימי הבא</label>
          <input className="field" id="till-next-barcode" dir="ltr" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={28} placeholder="N12000101" value={values.pos_next_barcode} onChange={set("pos_next_barcode")} aria-describedby="till-barcode-hint" required />
          <p id="till-barcode-hint" className="mt-1 text-xs text-muted">
            אות הספק ומספר רץ, שמתקדם לבד.
          </p>
        </div>
      )}
      <div className="sm:col-start-1">
        <label className="label" htmlFor="till-price-mode">איך נקבע המחיר</label>
        <select className="field min-h-11" id="till-price-mode" value={values.price_mode} onChange={set("price_mode")} aria-describedby="till-price-hint">
          <option value="multiplier">מחיר מועדון = עלות × מכפלה</option>
          <option value="retail">לפי מחיר הצרכן שמודפס במסמך</option>
        </select>
      </div>
      {byMultiplier && (
        <div>
          <label className="label" htmlFor="till-multiplier">מכפלה</label>
          <input className="field" id="till-multiplier" dir="ltr" inputMode="decimal" placeholder="2.9" value={values.price_multiplier} onChange={set("price_multiplier")} />
        </div>
      )}
      <p id="till-price-hint" className="text-xs text-muted sm:col-span-2">
        אפשר לשנות מחיר בכל שורה לפני יצירת הקובץ.
      </p>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "שומר…" : "שמירת פרטי הספק"}
        </button>
        <p aria-live="polite" className="text-sm text-danger empty:hidden">{error}</p>
      </div>
    </form>
  );
}
