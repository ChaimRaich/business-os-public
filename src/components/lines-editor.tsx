"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatAmount, parseAmount, type LineInput } from "@/lib/documents";
import { saveDocumentLines } from "@/app/(app)/receiving/actions";

export type EditorLine = Omit<LineInput, "keep_id"> & {
  key: string;
  id: string | null;
  uncertain: string[];
  note: string | null;
  match: { productId: string; productName: string; variantLabel: string; method: string } | null;
  /** False once the row is edited or added: its match is only recomputed on save. */
  saved: boolean;
};

type Field = Exclude<keyof LineInput, "keep_id">;

const COLUMNS: { field: Field; label: string; ltr?: boolean; numeric?: boolean; width: string; flag: string }[] = [
  { field: "supplier_sku", label: "מק״ט ספק", ltr: true, width: "lg:w-32", flag: "supplier_sku" },
  { field: "barcode", label: "ברקוד", ltr: true, width: "lg:w-36", flag: "barcode" },
  { field: "description", label: "תיאור", width: "lg:min-w-40 lg:flex-1", flag: "description" },
  { field: "variant_text", label: "וריאציה", width: "lg:w-28", flag: "variant" },
  { field: "quantity", label: "כמות", ltr: true, numeric: true, width: "lg:w-20", flag: "quantity" },
  { field: "unit_cost", label: "עלות ליחידה", ltr: true, numeric: true, width: "lg:w-24", flag: "unit_cost" },
  { field: "retail_price", label: "מחיר צרכן", ltr: true, numeric: true, width: "lg:w-24", flag: "retail_price" },
];

const emptyLine = (key: string): EditorLine => ({
  key,
  id: null,
  supplier_sku: "",
  barcode: "",
  description: "",
  variant_text: "",
  quantity: "",
  unit_cost: "",
  retail_price: "",
  uncertain: [],
  note: null,
  match: null,
  saved: false,
});

export function LinesEditor({ documentId, initialLines }: { documentId: string; initialLines: EditorLine[] }) {
  const [lines, setLines] = useState(initialLines);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [seed, setSeed] = useState(0);

  // After a save the server sends fresh rows (new ids, new matches): take them.
  const [lastInitial, setLastInitial] = useState(initialLines);
  if (initialLines !== lastInitial) {
    setLastInitial(initialLines);
    if (!dirty) {
      setLines(initialLines);
    }
  }

  const update = (key: string, field: Field, value: string) => {
    setDirty(true);
    setMessage(null);
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, [field]: value, saved: false } : line)),
    );
  };

  const save = () =>
    startTransition(async () => {
      const result = await saveDocumentLines(
        documentId,
        lines.map((line) => ({
          supplier_sku: line.supplier_sku,
          barcode: line.barcode,
          description: line.description,
          variant_text: line.variant_text,
          quantity: line.quantity,
          unit_cost: line.unit_cost,
          retail_price: line.retail_price,
          keep_id: line.saved ? line.id : null,
        })),
      );
      setMessage(result);
      if (result.ok) {
        setDirty(false);
      }
    });

  const totalQuantity = lines.reduce((sum, line) => sum + (parseAmount(line.quantity) ?? 0), 0);
  const totalCost = lines.reduce(
    (sum, line) => sum + (parseAmount(line.quantity) ?? 0) * (parseAmount(line.unit_cost) ?? 0),
    0,
  );

  return (
    <section className="card">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">שורות המסמך</h2>
        <p className="text-sm text-muted">
          {lines.length} שורות · {formatAmount(totalQuantity, 0)} יחידות · עלות לפני מע״מ{" "}
          <bdi dir="ltr">₪{formatAmount(totalCost)}</bdi>
        </p>
      </div>

      {lines.length === 0 && (
        <p className="mb-4 text-sm text-muted">אין שורות. אפשר להוסיף שורות ידנית לפי המסמך.</p>
      )}

      <ol className="flex flex-col gap-3 lg:gap-0 lg:divide-y lg:divide-line">
        {lines.map((line, index) => (
          <li key={line.key} className="rounded-lg border border-line p-3 lg:rounded-none lg:border-0 lg:px-0 lg:py-3">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 lg:flex lg:items-end lg:gap-2">
              <span className="col-span-2 text-sm font-medium text-muted tabular-nums lg:w-6 lg:pb-3 lg:text-center">
                <span className="lg:hidden">שורה </span>
                {index + 1}
              </span>
              {COLUMNS.map((column) => {
                const flagged = line.saved && line.uncertain.includes(column.flag);
                const id = `${column.field}-${line.key}`;
                return (
                  <div
                    key={column.field}
                    className={`${column.width} ${column.field === "description" ? "col-span-2" : ""}`}
                  >
                    <label htmlFor={id} className={`mb-1 block text-xs text-muted ${index > 0 ? "lg:sr-only" : ""}`}>
                      {column.label}
                    </label>
                    <input
                      id={id}
                      className={`field px-2 py-2 text-sm ${flagged ? "border-amber-500 bg-amber-50" : ""}`}
                      dir={column.ltr ? "ltr" : "auto"}
                      inputMode={column.numeric ? "decimal" : undefined}
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      value={line[column.field]}
                      aria-describedby={flagged ? `flag-${line.key}` : undefined}
                      onChange={(event) => update(line.key, column.field, event.target.value)}
                    />
                  </div>
                );
              })}
              <button
                type="button"
                className="col-span-2 min-h-11 justify-self-start px-1 text-sm text-danger underline-offset-4 hover:underline lg:pb-1"
                onClick={() => {
                  setDirty(true);
                  setMessage(null);
                  setLines((current) => current.filter((l) => l.key !== line.key));
                }}
              >
                מחיקה<span className="sr-only"> של שורה {index + 1}</span>
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs lg:ps-8">
              {!line.saved ? (
                <span className="text-muted">ההתאמה לקטלוג תתעדכן בשמירה</span>
              ) : line.match ? (
                <span className="text-accent-strong">
                  ✓ בקטלוג:{" "}
                  <Link href={`/products/${line.match.productId}`} className="underline underline-offset-2">
                    {line.match.productName}
                    {line.match.variantLabel && ` · ${line.match.variantLabel}`}
                  </Link>{" "}
                  <span className="text-muted">
                    (לפי {line.match.method === "barcode" ? "ברקוד" : "מק״ט ספק"})
                  </span>
                </span>
              ) : (
                <span className="rounded-full bg-canvas px-2 py-0.5 text-muted">לא נמצא בקטלוג</span>
              )}
              {line.saved && line.uncertain.length > 0 && (
                <span id={`flag-${line.key}`} className="text-amber-800">
                  ⚠ כדאי לבדוק מול המסמך:{" "}
                  {COLUMNS.filter((c) => line.uncertain.includes(c.flag)).map((c) => c.label).join(", ") || "השורה"}
                </span>
              )}
              {line.saved && line.note && <span className="text-muted">{line.note}</span>}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <button
          type="button"
          className="btn-quiet"
          onClick={() => {
            setDirty(true);
            setMessage(null);
            setLines((current) => [...current, emptyLine(`new-${seed}`)]);
            setSeed((value) => value + 1);
          }}
        >
          הוספת שורה
        </button>
        <button type="button" className="btn" disabled={pending || !dirty} onClick={save}>
          {pending ? "שומר…" : "שמירת השורות"}
        </button>
        <p aria-live="polite" className={`text-sm empty:hidden ${message?.error ? "text-danger" : "text-accent"}`}>
          {message?.error ?? (dirty ? "יש שינויים שלא נשמרו." : message?.ok)}
        </p>
      </div>
    </section>
  );
}
