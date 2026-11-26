"use client";

import { useActionState, useState } from "react";
import { AlertCircle, Barcode, Loader2, Package, Plus, Trash2 } from "lucide-react";
import type { FormAction } from "@/components/action-form";

type Row = {
  key: number;
  label: string;
  barcode: string;
  supplier_sku: string;
  pos: string;
  web: string;
};

const CODE_FIELDS = [
  { name: "barcode", label: "ברקוד" },
  { name: "supplier_sku", label: "מק״ט ספק" },
  { name: "pos", label: "מק״ט קופה" },
  { name: "web", label: "מזהה באתר" },
] as const;

const emptyRow = (key: number): Row => ({ key, label: "", barcode: "", supplier_sku: "", pos: "", web: "" });

export function ProductForm({
  action,
  suppliers,
}: {
  action: FormAction;
  suppliers: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [rows, setRows] = useState<Row[]>([emptyRow(0)]);
  const [nextKey, setNextKey] = useState(1);
  const hasVariants = rows.length > 1;

  const update = (key: number, field: keyof Omit<Row, "key">, value: string) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, [field]: value } : row)));

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input
        type="hidden"
        name="variants"
        value={JSON.stringify(
          rows.map((row) => ({
            label: row.label,
            barcode: row.barcode,
            supplier_sku: row.supplier_sku,
            pos: row.pos,
            web: row.web,
          })),
        )}
      />

      <section className="card">
        <h2 className="section-heading mb-4">
          <Package className="size-4.5 text-accent" aria-hidden />
          <span>פרטי הדגם</span>
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="product-name">שם המוצר</label>
            <input className="field" id="product-name" name="name" maxLength={200} required placeholder="טבעת כסף CAG020-1" />
          </div>
          <div>
            <label className="label" htmlFor="product-supplier">ספק</label>
            <select className="field min-h-11" id="product-supplier" name="supplier_id" defaultValue="">
              <option value="">ללא ספק</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="product-notes">הערות</label>
            <input className="field" id="product-notes" name="notes" />
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="section-heading">
          <Barcode className="size-4.5 text-accent" aria-hidden />
          <span>מק״טים ווריאציות</span>
        </h2>
        <p className="mt-1.5 mb-5 text-sm text-muted">
          הקלידו כל קוד בדיוק כפי שהוא מודפס, כולל אפסים בהתחלה. שדה שאין לכם משאירים ריק.
          {hasVariants && " מק״ט ספק יכול לחזור בכמה וריאציות; ברקוד ומק״ט קופה לא."}
        </p>

        <div className="flex flex-col gap-4">
          {rows.map((row, index) => (
            <fieldset key={row.key} className="rounded-xl border border-line bg-surface-subtle/40 p-4">
              <legend className="rounded-md bg-surface px-2 py-0.5 text-xs font-semibold text-muted">
                {hasVariants ? `וריאציה ${index + 1}` : "פריט יחיד"}
              </legend>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {hasVariants && (
                  <div>
                    <label className="label" htmlFor={`label-${row.key}`}>שם הווריאציה</label>
                    <input
                      className="field"
                      id={`label-${row.key}`}
                      value={row.label}
                      onChange={(event) => update(row.key, "label", event.target.value)}
                      placeholder="מידה 7"
                      maxLength={80}
                    />
                  </div>
                )}
                {CODE_FIELDS.map((field) => (
                  <div key={field.name}>
                    <label className="label" htmlFor={`${field.name}-${row.key}`}>{field.label}</label>
                    <input
                      className="field font-mono text-sm"
                      id={`${field.name}-${row.key}`}
                      dir="ltr"
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      value={row[field.name]}
                      onChange={(event) => update(row.key, field.name, event.target.value)}
                      maxLength={64}
                    />
                  </div>
                ))}
              </div>
              {hasVariants && (
                <button
                  type="button"
                  className="mt-3 inline-flex min-h-10 cursor-pointer items-center gap-1.5 text-sm font-medium text-danger hover:underline"
                  onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  <span>הסרת וריאציה {index + 1}</span>
                </button>
              )}
            </fieldset>
          ))}
        </div>

        <button
          type="button"
          className="btn-quiet mt-4"
          onClick={() => {
            // Variants of one model usually share the supplier SKU, so carry it over.
            const last = rows[rows.length - 1];
            setRows((current) => [...current, { ...emptyRow(nextKey), supplier_sku: last.supplier_sku }]);
            setNextKey((key) => key + 1);
          }}
        >
          <Plus className="size-4" aria-hidden />
          <span>{hasVariants ? "וריאציה נוספת" : "למוצר יש מידות או צבעים? הוספת וריאציה"}</span>
        </button>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          <span>{pending ? "שומר…" : "שמירת המוצר"}</span>
        </button>
        <div aria-live="polite" className="empty:hidden">
          {state?.error && (
            <p className="inline-flex items-center gap-2 rounded-xl border border-danger/25 bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
              <AlertCircle className="size-4 shrink-0" aria-hidden />
              <span>{state.error}</span>
            </p>
          )}
        </div>
      </div>
    </form>
  );
}
