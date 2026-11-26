"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2, Plus, Save, ShieldCheck, TableProperties, Trash2 } from "lucide-react";
import { formatAmount, parseAmount, type LineInput } from "@/lib/documents";
import { approveDocument, saveDocumentLines } from "@/app/(app)/receiving/actions";
import { LineLinking, UnlinkButton } from "@/components/line-linking";
import {
  asProductType,
  effectivePrices,
  MATERIAL_LABELS,
  MATERIALS,
  PRODUCT_TYPE_LABELS,
  PRODUCT_TYPES,
  type Material,
  type PricingRule,
  type ProductType,
} from "@/lib/pricing";

export type EditorLine = Omit<LineInput, "keep_id" | "manual_variant_id"> & {
  key: string;
  id: string | null;
  uncertain: string[];
  note: string | null;
  match: {
    variantId: string;
    productId: string;
    productName: string;
    variantLabel: string;
    method: string;
    posCode: string | null;
    salePrice: number | null;
    clubPrice: number | null;
    productType: ProductType | null;
    material: Material | null;
  } | null;
  guessedType: ProductType | null;
  skuProducts: { id: string; name: string }[];
  /** False once the row is edited or added: its match is only recomputed on save. */
  saved: boolean;
};

type PricingField = "sale_price" | "club_price" | "product_type" | "material";
type Field = Exclude<keyof LineInput, "keep_id" | "manual_variant_id" | PricingField>;

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
  sale_price: "",
  club_price: "",
  product_type: "",
  material: "",
  match: null,
  guessedType: null,
  skuProducts: [],
  saved: false,
});

type Props = {
  documentId: string;
  initialLines: EditorLine[];
  /** The supplier's pricing rule; null until a supplier is chosen. */
  rule: PricingRule | null;
  /** Another upload looks like the same document. */
  duplicate: boolean;
};

export function LinesEditor({ documentId, initialLines, rule, duplicate }: Props) {
  const [lines, setLines] = useState(initialLines);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [seed, setSeed] = useState(0);
  const [acknowledged, setAcknowledged] = useState(false);

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

  /** Pricing and classification: the row keeps its match and what the document said. */
  const classify = (key: string | null, field: PricingField, value: string) => {
    setDirty(true);
    setMessage(null);
    setLines((current) =>
      current.map((line) => (key === null || line.key === key ? { ...line, [field]: value } : line)),
    );
  };

  const approve = () =>
    startTransition(async () => {
      try {
        setMessage(await approveDocument(documentId));
      } catch {
        setMessage({ error: "הפעולה נכשלה. רעננו את העמוד ובדקו אם הקליטה אושרה." });
      }
    });

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
          sale_price: line.sale_price,
          club_price: line.club_price,
          product_type: line.product_type,
          material: line.material,
          manual_variant_id: line.match?.method === "manual" ? line.match.variantId : null,
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

  const missingProduct = lines.filter((line) => !line.match).length;
  const missingQuantity = lines.filter((line) => !((parseAmount(line.quantity) ?? 0) > 0)).length;
  const missingCost = lines.filter((line) => !((parseAmount(line.unit_cost) ?? 0) > 0)).length;
  const blockers = [
    !rule && "לא נבחר ספק בפרטי המסמך.",
    lines.length === 0 && "אין שורות.",
    dirty && "יש שינויים שלא נשמרו.",
    !dirty && missingProduct > 0 && `ב-${missingProduct} שורות לא נבחר מוצר.`,
    !dirty && missingQuantity > 0 && `ב-${missingQuantity} שורות חסרה כמות גדולה מאפס.`,
  ].filter((blocker): blocker is string => Boolean(blocker));

  return (
    <>
      <section className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-heading">
            <TableProperties className="size-4.5 text-accent" aria-hidden />
            <span>שורות המסמך</span>
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="badge bg-surface-subtle text-ink tabular-nums">{lines.length} שורות</span>
            <span className="badge bg-surface-subtle text-ink tabular-nums">{formatAmount(totalQuantity, 0)} יחידות</span>
            <span className="badge bg-accent-soft text-accent-strong tabular-nums">
              עלות לפני מע״מ: <bdi dir="ltr">₪{formatAmount(totalCost)}</bdi>
            </span>
          </div>
        </div>

        {lines.length > 1 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-surface-subtle/60 px-3.5 py-2.5">
            <span className="text-xs font-semibold text-muted">חומר לכל השורות:</span>
            {MATERIALS.map((value) => (
              <button
                key={value}
                type="button"
                className="btn-quiet min-h-8 px-3 py-1 text-xs"
                onClick={() => classify(null, "material", value)}
              >
                {MATERIAL_LABELS[value]}
              </button>
            ))}
          </div>
        )}

        {lines.length === 0 && (
          <p className="mb-4 rounded-xl bg-surface-subtle/60 px-4 py-3 text-sm text-muted">
            אין שורות. אפשר להוסיף שורות ידנית לפי המסמך.
          </p>
        )}

        <ol className="flex flex-col gap-3 lg:gap-0 lg:divide-y lg:divide-line">
          {lines.map((line, index) => (
            <li key={line.key} className="rounded-xl border border-line bg-surface-subtle/20 p-3.5 lg:rounded-none lg:border-0 lg:bg-transparent lg:px-0 lg:py-4">
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 lg:flex lg:items-end lg:gap-2">
                <span className="col-span-2 text-xs font-bold text-muted tabular-nums lg:w-6 lg:pb-3 lg:text-center">
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
                      <label htmlFor={id} className={`mb-1 block text-xs font-medium text-muted ${index > 0 ? "lg:sr-only" : ""}`}>
                        {column.label}
                      </label>
                      <input
                        id={id}
                        className={`field px-2.5 py-2 text-sm ${column.ltr ? "font-mono" : ""} ${flagged ? "border-warning-border bg-warning-soft" : ""}`}
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
                  className="col-span-2 inline-flex min-h-10 cursor-pointer items-center gap-1 justify-self-start rounded-lg px-2 text-xs font-semibold text-danger hover:bg-danger-soft lg:mb-0.5"
                  onClick={() => {
                    setDirty(true);
                    setMessage(null);
                    setLines((current) => current.filter((l) => l.key !== line.key));
                  }}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  <span>מחיקה<span className="sr-only"> של שורה {index + 1}</span></span>
                </button>
              </div>

              <PricingRow line={line} rule={rule} onChange={(field, value) => classify(line.key, field, value)} />

              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs lg:ps-8">
                {!line.saved ? (
                  <span className="text-muted">ההתאמה לקטלוג תתעדכן בשמירה</span>
                ) : line.match ? (
                  <span className="inline-flex flex-wrap items-center gap-1.5 text-accent-strong">
                    <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
                    <span>בקטלוג:</span>
                    <Link href={`/products/${line.match.productId}`} className="font-semibold underline underline-offset-2">
                      {line.match.productName}
                      {line.match.variantLabel && ` · ${line.match.variantLabel}`}
                    </Link>
                    <span className="text-muted">({MATCH_LABELS[line.match.method] ?? line.match.method})</span>
                    {line.match.posCode && (
                      <span className="text-muted">
                        · ברקוד בקופה <bdi dir="ltr" className="font-mono text-ink">{line.match.posCode}</bdi>
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="badge bg-surface-subtle py-0.5 text-muted">לא נמצא בקטלוג</span>
                )}
                {line.saved && line.match?.method === "manual" && line.id && (
                  <UnlinkButton lineId={line.id} disabled={dirty} />
                )}
                {line.saved && line.uncertain.length > 0 && (
                  <span id={`flag-${line.key}`} className="inline-flex items-center gap-1 font-medium text-warning">
                    <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                    <span>
                      כדאי לבדוק מול המסמך:{" "}
                      {COLUMNS.filter((c) => line.uncertain.includes(c.flag)).map((c) => c.label).join(", ") || "השורה"}
                    </span>
                  </span>
                )}
                {line.saved && line.note && <span className="text-muted">{line.note}</span>}
              </div>
              {line.saved && !line.match && line.id && (
                <div className="lg:ps-8">
                  <LineLinking
                    // Line ids change on every save, so the panel starts from fresh values.
                    key={line.id}
                    lineId={line.id}
                    defaults={{
                      name: line.description || line.supplier_sku,
                      label: line.variant_text,
                      query: line.supplier_sku || line.barcode,
                      productType: line.product_type || line.guessedType || "",
                      material: line.material,
                    }}
                    skuProducts={line.skuProducts}
                    hasSupplier={rule !== null}
                    disabled={dirty}
                  />
                </div>
              )}
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
            <Plus className="size-4" aria-hidden />
            <span>הוספת שורה</span>
          </button>
          <button type="button" className="btn" disabled={pending || !dirty} onClick={save}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
            <span>{pending ? "שומר…" : "שמירת השורות"}</span>
          </button>
          <p aria-live="polite" className={`text-sm font-medium empty:hidden ${message?.error ? "text-danger" : dirty ? "text-warning" : "text-accent"}`}>
            {message?.error ?? (dirty ? "יש שינויים שלא נשמרו." : message?.ok)}
          </p>
        </div>
      </section>

      <section className="card border-accent/30">
        <h2 className="section-heading">
          <ShieldCheck className="size-4.5 text-accent" aria-hidden />
          <span>אישור קליטה למלאי</span>
        </h2>
        <p className="mt-1.5 text-sm text-muted">
          האישור מוסיף את הכמויות למלאי ונועל את המסמך. תיקון אחרי אישור נעשה בהתאמת מלאי. אזהרות על סכומים אינן
          חוסמות.
        </p>
        {blockers.length > 0 && (
          <ul className="mt-3 list-disc rounded-xl bg-surface-subtle/70 py-3 pe-4 ps-8 text-sm text-ink">
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        )}
        {missingCost > 0 && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-xl border border-warning-border/45 bg-warning-soft px-3.5 py-2 text-sm text-warning">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            <span>ב-{missingCost} שורות חסרה עלות. אפשר לאשר, אבל לפני יצירת הקובץ לקופה יהיה צריך להשלים אותה.</span>
          </p>
        )}
        {duplicate && (
          <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
            <input type="checkbox" className="mt-1 accent-danger" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
            <span>נראה שהמסמך כבר הועלה בעבר. בדקתי: זו סחורה שעוד לא נקלטה.</span>
          </label>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn"
            disabled={pending || blockers.length > 0 || (duplicate && !acknowledged)}
            onClick={approve}
          >
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CheckCircle2 className="size-4" aria-hidden />}
            <span>{pending ? "רק רגע…" : "אישור קליטה"}</span>
          </button>
          <p aria-live="polite" className="text-sm font-medium text-danger empty:hidden">{message?.error}</p>
        </div>
      </section>
    </>
  );
}

const MATCH_LABELS: Record<string, string> = {
  barcode: "לפי ברקוד",
  supplier_sku: "לפי מק״ט ספק",
  manual: "שויך ידנית",
};

function PricingRow({
  line,
  rule,
  onChange,
}: {
  line: EditorLine;
  rule: PricingRule | null;
  onChange: (field: PricingField, value: string) => void;
}) {
  // What approval will use for the fields left empty.
  const automatic = effectivePrices(
    { sale: null, club: parseAmount(line.club_price) || null },
    line.match ? { sale: line.match.salePrice, club: line.match.clubPrice } : null,
    parseAmount(line.unit_cost) || null,
    rule,
  );
  const autoType = line.match?.productType ?? line.guessedType;
  const autoMaterial = line.match?.material ?? null;
  const prices = [
    { field: "sale_price", label: "מחיר מכירה", auto: automatic.sale },
    { field: "club_price", label: "מחיר מועדון", auto: automatic.club },
  ] as const;

  return (
    <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2 lg:flex lg:ps-8">
      {prices.map(({ field, label, auto }) => (
        <div key={field} className="lg:w-32">
          <label htmlFor={`${field}-${line.key}`} className="mb-1 block text-xs text-muted">{label}</label>
          <input
            id={`${field}-${line.key}`}
            className="field px-2.5 py-2 text-sm tabular-nums"
            dir="ltr"
            inputMode="decimal"
            autoComplete="off"
            placeholder={auto === null ? "חסר" : `${auto} (אוטומטי)`}
            value={line[field]}
            onChange={(event) => onChange(field, event.target.value)}
          />
        </div>
      ))}
      <div className="lg:w-40">
        <label htmlFor={`product_type-${line.key}`} className="mb-1 block text-xs text-muted">סוג מוצר</label>
        <select
          id={`product_type-${line.key}`}
          className="field min-h-10.5 px-2.5 py-2 text-sm"
          value={asProductType(line.product_type) ?? ""}
          onChange={(event) => onChange("product_type", event.target.value)}
        >
          <option value="">{autoType ? `${PRODUCT_TYPE_LABELS[autoType]} (אוטומטי)` : "לא ידוע"}</option>
          {PRODUCT_TYPES.map((type) => (
            <option key={type} value={type}>{PRODUCT_TYPE_LABELS[type]}</option>
          ))}
        </select>
      </div>
      <div className="lg:w-32">
        <label htmlFor={`material-${line.key}`} className="mb-1 block text-xs text-muted">חומר</label>
        <select
          id={`material-${line.key}`}
          className="field min-h-10.5 px-2.5 py-2 text-sm"
          value={line.material}
          onChange={(event) => onChange("material", event.target.value)}
        >
          <option value="">{autoMaterial ? `${MATERIAL_LABELS[autoMaterial]} (מהמוצר)` : "לא ידוע"}</option>
          {MATERIALS.map((value) => (
            <option key={value} value={value}>{MATERIAL_LABELS[value]}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
