"use client";

import { useState, useTransition } from "react";
import { Link2, Plus, Search, Unlink } from "lucide-react";
import { createItemForLine, linkLine, searchCatalog, type CatalogHit } from "@/app/(app)/receiving/actions";
import { MATERIAL_LABELS, MATERIALS, PRODUCT_TYPE_LABELS, PRODUCT_TYPES } from "@/lib/pricing";

const GENERIC_ERROR = "הפעולה נכשלה. נסו שוב בעוד רגע.";

type Props = {
  lineId: string;
  /** Prefill for a new item, taken from the line. */
  defaults: { name: string; label: string; query: string; productType: string; material: string };
  /** Products that already carry this line's supplier SKU: likely a new size or colour of one. */
  skuProducts: { id: string; name: string }[];
  hasSupplier: boolean;
  /** Linking works on saved lines, so unsaved edits come first. */
  disabled: boolean;
};

export function LineLinking({ lineId, defaults, skuProducts, hasSupplier, disabled }: Props) {
  const [panel, setPanel] = useState<"create" | "link" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [productId, setProductId] = useState(skuProducts[0]?.id ?? "");
  const [name, setName] = useState(defaults.name);
  const [label, setLabel] = useState(defaults.label);
  const [productType, setProductType] = useState(defaults.productType);
  const [material, setMaterial] = useState(defaults.material);
  const [query, setQuery] = useState(defaults.query);
  const [hits, setHits] = useState<CatalogHit[] | null>(null);

  const run = (task: () => Promise<{ error?: string } | void>) =>
    startTransition(async () => {
      setError(null);
      try {
        setError((await task())?.error ?? null);
      } catch {
        setError(GENERIC_ERROR);
      }
    });

  const toggle = (next: "create" | "link") => {
    setError(null);
    setPanel((current) => (current === next ? null : next));
  };

  return (
    <div className="mt-2.5 w-full">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`btn-quiet min-h-9 px-3 py-1 text-xs ${panel === "create" ? "border-accent bg-accent-soft text-accent-strong" : ""}`}
          disabled={disabled || !hasSupplier}
          aria-expanded={panel === "create"}
          onClick={() => toggle("create")}
        >
          <Plus className="size-3.5" aria-hidden />
          <span>יצירת מוצר חדש</span>
        </button>
        <button
          type="button"
          className={`btn-quiet min-h-9 px-3 py-1 text-xs ${panel === "link" ? "border-accent bg-accent-soft text-accent-strong" : ""}`}
          disabled={disabled}
          aria-expanded={panel === "link"}
          onClick={() => toggle("link")}
        >
          <Link2 className="size-3.5" aria-hidden />
          <span>שיוך למוצר קיים</span>
        </button>
        {disabled && <span className="text-xs text-muted">שמרו את השורות כדי לשייך.</span>}
        {!disabled && !hasSupplier && <span className="text-xs text-muted">ליצירת מוצר צריך לבחור ספק למסמך.</span>}
      </div>

      {panel === "create" && !disabled && (
        <div className="card-subtle mt-3 grid gap-3 sm:grid-cols-2">
          {skuProducts.length > 0 && (
            <div className="sm:col-span-2">
              <label className="label" htmlFor={`target-${lineId}`}>להוסיף אל</label>
              <select className="field min-h-11" id={`target-${lineId}`} value={productId} onChange={(e) => setProductId(e.target.value)}>
                {skuProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    וריאציה חדשה של {product.name}
                  </option>
                ))}
                <option value="">מוצר חדש לגמרי</option>
              </select>
            </div>
          )}
          {!productId && (
            <div className="sm:col-span-2">
              <label className="label" htmlFor={`name-${lineId}`}>שם המוצר</label>
              <input className="field" id={`name-${lineId}`} value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          <div>
            <label className="label" htmlFor={`label-${lineId}`}>
              {productId ? "שם הווריאציה" : "וריאציה (אם יש)"}
            </label>
            <input className="field" id={`label-${lineId}`} value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />
          </div>
          {!productId && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor={`type-${lineId}`}>סוג</label>
                <select className="field min-h-11" id={`type-${lineId}`} value={productType} onChange={(e) => setProductType(e.target.value)}>
                  <option value="">לא נבחר</option>
                  {PRODUCT_TYPES.map((type) => (
                    <option key={type} value={type}>{PRODUCT_TYPE_LABELS[type]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor={`material-${lineId}`}>חומר</label>
                <select className="field min-h-11" id={`material-${lineId}`} value={material} onChange={(e) => setMaterial(e.target.value)}>
                  <option value="">לא נבחר</option>
                  {MATERIALS.map((value) => (
                    <option key={value} value={value}>{MATERIAL_LABELS[value]}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <p className="text-xs text-muted sm:col-span-2">
            הברקוד ומק״ט הספק מהשורה יישמרו לפריט, ויוקצה לו ברקוד פנימי אם לספק מוגדר קוד בקופה.
          </p>
          <button
            type="button"
            className="btn sm:col-span-2 sm:justify-self-start"
            disabled={pending}
            onClick={() =>
              run(() => createItemForLine({ lineId, productId: productId || null, name, label, productType, material }))
            }
          >
            {pending ? "יוצר…" : "יצירה ושיוך"}
          </button>
        </div>
      )}

      {panel === "link" && !disabled && (
        <div className="card-subtle mt-3">
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              run(async () => setHits(await searchCatalog(query)));
            }}
          >
            <div className="min-w-0 flex-1 basis-48">
              <label className="label" htmlFor={`search-${lineId}`}>חיפוש לפי שם, ברקוד או מק״ט</label>
              <input className="field" id={`search-${lineId}`} type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <button type="submit" className="btn-quiet" disabled={pending}>
              <Search className="size-4" aria-hidden />
              <span>חיפוש</span>
            </button>
          </form>
          {hits?.length === 0 && <p className="mt-2.5 text-sm text-muted">לא נמצאו מוצרים.</p>}
          {hits && hits.length > 0 && (
            <ul className="mt-3 max-h-64 divide-y divide-line overflow-y-auto rounded-xl border border-line bg-surface px-3">
              {hits.map((hit) => (
                <li key={hit.variantId} className="flex flex-wrap items-center gap-x-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 basis-48 font-medium text-ink">
                    {hit.productName}
                    {hit.variantLabel && <span className="text-muted"> · {hit.variantLabel}</span>}
                    <bdi dir="ltr" className="block text-right font-mono text-xs text-muted">{hit.codes.join(" · ")}</bdi>
                  </span>
                  <button
                    type="button"
                    className="btn-quiet min-h-8 px-3 py-1 text-xs"
                    disabled={pending}
                    onClick={() => run(() => linkLine(lineId, hit.variantId))}
                  >
                    שיוך
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p aria-live="polite" className="mt-2 text-sm font-medium text-danger empty:hidden">{error}</p>
    </div>
  );
}

export function UnlinkButton({ lineId, disabled }: { lineId: string; disabled: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <button
        type="button"
        className="inline-flex cursor-pointer items-center gap-1 font-medium text-danger underline-offset-2 hover:underline disabled:opacity-50"
        disabled={disabled || pending}
        onClick={() =>
          startTransition(async () => {
            try {
              setError((await linkLine(lineId, null)).error ?? null);
            } catch {
              setError(GENERIC_ERROR);
            }
          })
        }
      >
        <Unlink className="size-3" aria-hidden />
        <span>ביטול השיוך</span>
      </button>
      {error && <span className="text-danger">{error}</span>}
    </>
  );
}
