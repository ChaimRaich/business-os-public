"use client";

import { useState, useTransition } from "react";
import {
  cellText,
  guessMapping,
  MAX_SALES_ROWS,
  REQUIRED_SALES_FIELDS,
  SALES_FIELD_LABELS,
  SALES_FIELDS,
  toSalesRows,
  type SalesField,
} from "@/lib/sales";
import { importSales } from "@/app/(app)/sales/actions";

type Mapping = Record<SalesField, number | null>;
type Loaded = { name: string; grid: unknown[][]; headerRow: number; headers: string[] };

const ACCEPT = ".xls,.xlsx,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_BYTES = 10 * 1024 * 1024;

/** Israeli tills often write CSV in the Windows Hebrew code page rather than UTF-8. */
function decodeText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1255").decode(buffer);
  }
}

async function readFile(file: File): Promise<Loaded> {
  const buffer = await file.arrayBuffer();

  // The file is read here, in the browser; the server only ever receives plain rows.
  const XLSX = await import("xlsx");
  const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
  const book = isCsv
    ? XLSX.read(decodeText(buffer), { type: "string", raw: true })
    : XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = book.Sheets[book.SheetNames[0]];
  const grid = sheet ? (XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" }) as unknown[][]) : [];

  // The header is the first line with at least two filled cells; titles above it are skipped.
  const headerRow = grid.findIndex((line) => line.filter((cell) => cellText(cell) !== "").length >= 2);
  if (headerRow === -1) {
    throw new Error("empty");
  }
  const headers = grid[headerRow].map((cell, index) => cellText(cell) || `עמודה ${index + 1}`);
  return { name: file.name, grid, headerRow, headers };
}

export function SalesImportForm({
  businessId,
  warehouses,
}: {
  businessId: string;
  warehouses: { id: string; name: string; is_default: boolean }[];
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [warehouseId, setWarehouseId] = useState((warehouses.find((w) => w.is_default) ?? warehouses[0])?.id ?? "");
  const [reportDate, setReportDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [pending, startTransition] = useTransition();
  const storageKey = `sales-columns:${businessId}`;

  async function choose(file: File | undefined) {
    if (!file) return;
    setError(null);
    setLoaded(null);
    setMapping(null);
    if (file.size > MAX_BYTES) {
      setError("הקובץ גדול מ-10MB. ייצאו דוח לתקופה קצרה יותר.");
      return;
    }
    setReading(true);
    try {
      const next = await readFile(file);
      const guessed = guessMapping(next.headers);
      // The columns chosen last time, when this report has the same header names.
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null") as Record<string, string> | null;
        for (const field of SALES_FIELDS) {
          const index = saved?.[field] ? next.headers.indexOf(saved[field]) : -1;
          if (index !== -1) guessed[field] = index;
        }
      } catch {
        // No saved choice: the guess stands.
      }
      setLoaded(next);
      setMapping(guessed);
    } catch {
      setError("לא הצלחנו לקרוא את הקובץ. מתקבלים קובצי Excel ‏(xls, xlsx) ו-CSV עם שורת כותרות.");
    } finally {
      setReading(false);
    }
  }

  const parsed = loaded && mapping ? toSalesRows(loaded.grid, loaded.headerRow, mapping) : null;
  const missing = mapping ? REQUIRED_SALES_FIELDS.filter((field) => mapping[field] === null) : [];
  const duplicateColumn =
    mapping !== null &&
    Object.values(mapping).filter((v) => v !== null).length !==
      new Set(Object.values(mapping).filter((v) => v !== null)).size;
  const returns = parsed?.rows.filter((row) => row.quantity < 0).length ?? 0;
  const undated = parsed ? parsed.rows.filter((row) => !row.sold_at).length : 0;
  // Without a date on every row, the user says which day the report sums up.
  const needsDate = undated > 0;
  const tooMany = (parsed?.rows.length ?? 0) > MAX_SALES_ROWS;
  const ready =
    parsed && parsed.rows.length > 0 && missing.length === 0 && !duplicateColumn && !tooMany && warehouseId &&
    (!needsDate || reportDate);

  function submit() {
    if (!loaded || !mapping || !parsed) return;
    setError(null);
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify(Object.fromEntries(SALES_FIELDS.map((field) => [field, mapping[field] === null ? "" : loaded.headers[mapping[field]]]))),
      );
    } catch {
      // Remembering the columns is a convenience only.
    }
    startTransition(async () => {
      const result = await importSales({ warehouseId, fileName: loaded.name, reportDate: needsDate ? reportDate : null, rows: parsed.rows });
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="card">
        <h2 className="font-semibold">1. בחירת הדוח</h2>
        <p className="mt-1 max-w-prose text-sm text-muted">
          דוח ברמת פריט, עם ברקוד וכמות. Excel או CSV.
        </p>
        <label className="label mt-4" htmlFor="sales-file">קובץ הדוח</label>
        <input
          className="field"
          id="sales-file"
          type="file"
          accept={ACCEPT}
          disabled={reading || pending}
          onChange={(event) => choose(event.target.files?.[0])}
        />
        {reading && <p className="mt-2 text-sm text-muted" aria-live="polite">קורא את הקובץ…</p>}
      </section>

      {loaded && mapping && parsed && (
        <>
          <section className="card">
            <h2 className="font-semibold">2. איזו עמודה היא מה</h2>
            <p className="mt-1 max-w-prose text-sm text-muted">
              בדקו את הזיהוי. הוא יישמר לדוח הבא.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {SALES_FIELDS.map((field) => (
                <div key={field}>
                  <label className="label" htmlFor={`column-${field}`}>
                    {SALES_FIELD_LABELS[field]}
                    {!REQUIRED_SALES_FIELDS.includes(field) && <span className="font-normal text-muted"> (לא חובה)</span>}
                  </label>
                  <select
                    className="field min-h-11"
                    id={`column-${field}`}
                    value={mapping[field] ?? ""}
                    onChange={(event) =>
                      setMapping({ ...mapping, [field]: event.target.value === "" ? null : Number(event.target.value) })
                    }
                  >
                    <option value="">אין עמודה כזו</option>
                    {loaded.headers.map((header, index) => (
                      <option key={index} value={index}>
                        {header}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <div>
                <label className="label" htmlFor="sales-warehouse">המחסן שממנו נמכר</label>
                <select className="field min-h-11" id="sales-warehouse" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {needsDate && (
              <div className="mt-4 border-t border-line pt-4 sm:max-w-xs">
                <label className="label" htmlFor="report-date">היום שהדוח מסכם</label>
                <input
                  className="field"
                  id="report-date"
                  type="date"
                  required
                  value={reportDate}
                  onChange={(event) => setReportDate(event.target.value)}
                  aria-describedby="report-date-hint"
                />
                <p id="report-date-hint" className="mt-1 text-xs text-muted">
                  {mapping.sold_at === null ? "בדוח אין עמודת תאריך." : "בחלק מהשורות התאריך לא נקרא."} המכירות יירשמו ביום הזה; דוח אחד ליום ולמחסן.
                </p>
              </div>
            )}
            {mapping.transaction_ref === null && !needsDate && (
              <p className="mt-4 rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">
                בלי מספר עסקה, דוחות שחופפים בתאריכים יורידו את אותה מכירה פעמיים.
              </p>
            )}
          </section>

          <section className="card">
            <h2 className="font-semibold">3. בדיקה לפני הייבוא</h2>
            <ul className="mt-2 flex list-disc flex-col gap-1 ps-5 text-sm">
              <li>
                {parsed.rows.length} שורות מכירה ייובאו
                {returns > 0 && `, מתוכן ${returns} החזרות או ביטולים (כמות שלילית) שיחזירו מלאי`}.
              </li>
              {parsed.skipped > 0 && <li className="text-muted">{parsed.skipped} שורות ידולגו: ריקות, שורות סיכום, או פריטים בכמות אפס.</li>}
              {parsed.invalid.length > 0 && (
                <li className="text-danger">
                  {parsed.invalid.length} שורות לא ייובאו כי אין בהן כמות תקינה (שורות {parsed.invalid.slice(0, 8).join(", ")}
                  {parsed.invalid.length > 8 && "…"} בקובץ).
                </li>
              )}
              {missing.length > 0 && (
                <li className="text-danger">חובה לבחור עמודה עבור: {missing.map((field) => SALES_FIELD_LABELS[field]).join(", ")}.</li>
              )}
              {duplicateColumn && <li className="text-danger">אותה עמודה נבחרה ליותר משדה אחד.</li>}
              {tooMany && (
                <li className="text-danger">בדוח יותר מ-{MAX_SALES_ROWS} שורות. ייצאו אותו לתקופות קצרות יותר.</li>
              )}
            </ul>

            {parsed.rows.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-96 text-start text-sm">
                  <caption className="mb-2 text-start text-muted">חמש השורות הראשונות, כפי שייקלטו</caption>
                  <thead>
                    <tr className="border-b border-line text-muted">
                      {SALES_FIELDS.map((field) => (
                        <th key={field} scope="col" className="px-2 py-2 text-start font-medium">
                          {SALES_FIELD_LABELS[field]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {parsed.rows.slice(0, 5).map((row, index) => (
                      <tr key={index}>
                        <td className="px-2 py-2 font-mono"><bdi dir="ltr">{row.code}</bdi></td>
                        <td className="px-2 py-2 tabular-nums"><bdi dir="ltr">{row.quantity}</bdi></td>
                        <td className="px-2 py-2">{row.item_name ?? "—"}</td>
                        <td className="px-2 py-2"><bdi dir="ltr">{row.transaction_ref ?? "—"}</bdi></td>
                        <td className="px-2 py-2">{row.sold_at ? new Date(row.sold_at).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" }) : reportDate ? reportDate.split("-").reverse().join("/") : "—"}</td>
                        <td className="px-2 py-2 tabular-nums"><bdi dir="ltr">{row.unit_price ?? "—"}</bdi></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <button type="button" className="btn" disabled={!ready || pending} onClick={submit}>
                {pending ? "מייבא…" : "ייבוא והורדה מהמלאי"}
              </button>
              <p className="text-sm text-muted">פריט שלא בקטלוג יישמר בצד ולא ישנה מלאי עד שיזוהה.</p>
            </div>
          </section>
        </>
      )}

      <p aria-live="polite" role={error ? "alert" : undefined} className="text-sm text-danger empty:hidden">
        {error}
      </p>
    </div>
  );
}
