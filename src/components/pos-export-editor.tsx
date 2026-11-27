"use client";

import { useState, useTransition } from "react";
import { parseAmount } from "@/lib/documents";
import { saleFromClub } from "@/lib/pos-export";
import { createPosExport } from "@/app/(app)/receiving/actions";

export type ExportEditorRow = {
  variantId: string;
  title: string;
  codes: string;
  /** The barcode the till already knows, when the item was exported before. */
  posCode: string | null;
  quantity: number;
  cost: number | null;
  itemName: string;
  departmentId: string;
  clubPrice: string;
  salePrice: string;
};

export type DepartmentOption = { id: string; label: string; itemName: string | null };

export function PosExportEditor({
  documentId,
  initialRows,
  departments,
}: {
  documentId: string;
  initialRows: ExportEditorRow[];
  departments: DepartmentOption[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const patch = (variantId: string, change: Partial<ExportEditorRow>) => {
    setError(null);
    setRows((current) => current.map((row) => (row.variantId === variantId ? { ...row, ...change } : row)));
  };

  const setDepartment = (row: ExportEditorRow, departmentId: string) => {
    const suggestion = departments.find((d) => d.id === departmentId)?.itemName;
    patch(row.variantId, { departmentId, ...(row.itemName === "" && suggestion ? { itemName: suggestion } : {}) });
  };

  const fillDown = () => {
    const first = rows[0];
    if (!first) return;
    setRows((current) =>
      current.map((row) => ({
        ...row,
        departmentId: row.departmentId || first.departmentId,
        itemName: row.itemName || first.itemName,
      })),
    );
  };

  const incomplete = rows.filter(
    (row) => !row.itemName.trim() || !row.departmentId || !parseAmount(row.clubPrice) || !parseAmount(row.salePrice),
  ).length;

  const submit = () =>
    startTransition(async () => {
      const result = await createPosExport(
        documentId,
        rows.map((row) => ({
          variant_id: row.variantId,
          item_name: row.itemName,
          department_id: row.departmentId,
          club_price: row.clubPrice,
          sale_price: row.salePrice,
        })),
      );
      if (result?.error) {
        setError(result.error);
      }
    });

  return (
    <section className="card">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">שורות הקובץ</h2>
        {rows.length > 1 && (
          <button type="button" className="text-sm text-accent underline underline-offset-4" onClick={fillDown}>
            העתקת המחלקה והשם מהשורה הראשונה לשורות הריקות
          </button>
        )}
      </div>

      <ol className="flex flex-col gap-3 lg:gap-0 lg:divide-y lg:divide-line">
        {rows.map((row, index) => (
          <li key={row.variantId} className="rounded-lg border border-line p-3 lg:rounded-none lg:border-0 lg:px-0 lg:py-3">
            <p className="mb-2 text-sm">
              <span className="font-medium">{row.title}</span>{" "}
              <bdi dir="ltr" className="font-mono text-xs text-muted">{row.codes}</bdi>
              <span className="text-muted">
                {" "}· {row.quantity} יח׳{row.cost !== null && <> · עלות <bdi dir="ltr">₪{row.cost.toFixed(2)}</bdi></>}
                {row.posCode && <> · כבר בקופה: <bdi dir="ltr" className="font-mono">{row.posCode}</bdi></>}
              </span>
            </p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 lg:flex lg:items-end lg:gap-2">
              <div className="col-span-2 lg:w-56">
                <label className={`mb-1 block text-xs text-muted ${index > 0 ? "lg:sr-only" : ""}`} htmlFor={`dep-${row.variantId}`}>מחלקה בקופה</label>
                <select className="field min-h-11 px-2 py-2 text-sm" id={`dep-${row.variantId}`} value={row.departmentId} onChange={(event) => setDepartment(row, event.target.value)}>
                  <option value="">בחירה…</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 lg:min-w-40 lg:flex-1">
                <label className={`mb-1 block text-xs text-muted ${index > 0 ? "lg:sr-only" : ""}`} htmlFor={`name-${row.variantId}`}>שם הפריט בקופה</label>
                <input className="field px-2 py-2 text-sm" id={`name-${row.variantId}`} value={row.itemName} maxLength={80} placeholder="טבעת כסף" onChange={(event) => patch(row.variantId, { itemName: event.target.value })} />
              </div>
              <div className="lg:w-28">
                <label className={`mb-1 block text-xs text-muted ${index > 0 ? "lg:sr-only" : ""}`} htmlFor={`club-${row.variantId}`}>מחיר מועדון</label>
                <input
                  className="field px-2 py-2 text-sm"
                  id={`club-${row.variantId}`}
                  dir="ltr"
                  inputMode="decimal"
                  value={row.clubPrice}
                  onChange={(event) => {
                    const club = parseAmount(event.target.value);
                    // The selling price follows the club price until the user sets it apart.
                    patch(row.variantId, { clubPrice: event.target.value, ...(club ? { salePrice: String(saleFromClub(club)) } : {}) });
                  }}
                />
              </div>
              <div className="lg:w-28">
                <label className={`mb-1 block text-xs text-muted ${index > 0 ? "lg:sr-only" : ""}`} htmlFor={`sale-${row.variantId}`}>מחיר מכירה</label>
                <input className="field px-2 py-2 text-sm" id={`sale-${row.variantId}`} dir="ltr" inputMode="decimal" value={row.salePrice} onChange={(event) => patch(row.variantId, { salePrice: event.target.value })} />
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <button type="button" className="btn" disabled={pending || incomplete > 0} onClick={submit}>
          {pending ? "מכין קובץ…" : "יצירת קובץ לקופה"}
        </button>
        <p aria-live="polite" className={`text-sm empty:hidden ${error ? "text-danger" : "text-muted"}`}>
          {error ?? (incomplete > 0 ? `חסרים פרטים ב-${incomplete} שורות: מחלקה, שם ומחירים.` : "")}
        </p>
      </div>
    </section>
  );
}
