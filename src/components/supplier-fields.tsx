type Supplier = {
  name: string;
  tax_id: string | null;
  phone: string | null;
  address: string | null;
  pos_code: string | null;
  pos_name: string | null;
  pos_barcode_source?: string;
  pos_next_barcode?: string | null;
  price_mode?: string;
  price_multiplier?: number | null;
  notes: string | null;
};

export function SupplierFields({ supplier }: { supplier?: Supplier }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label" htmlFor="supplier-name">שם הספק</label>
        <input className="field" id="supplier-name" name="name" defaultValue={supplier?.name} maxLength={120} required />
      </div>
      <div>
        <label className="label" htmlFor="supplier-tax-id">ח.פ. / עוסק מורשה</label>
        <input className="field" id="supplier-tax-id" name="tax_id" dir="ltr" inputMode="numeric" defaultValue={supplier?.tax_id ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor="supplier-phone">טלפון</label>
        <input className="field" id="supplier-phone" name="phone" type="tel" dir="ltr" defaultValue={supplier?.phone ?? ""} />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="supplier-address">כתובת</label>
        <input className="field" id="supplier-address" name="address" defaultValue={supplier?.address ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor="supplier-pos-code">קוד הספק בקופה</label>
        <input className="field" id="supplier-pos-code" name="pos_code" dir="ltr" defaultValue={supplier?.pos_code ?? ""} aria-describedby="supplier-pos-hint" />
      </div>
      <div>
        <label className="label" htmlFor="supplier-pos-name">שם הספק בקופה</label>
        <input className="field" id="supplier-pos-name" name="pos_name" defaultValue={supplier?.pos_name ?? ""} aria-describedby="supplier-pos-hint" />
      </div>
      <p id="supplier-pos-hint" className="text-xs text-muted sm:col-span-2">
        כפי שמוגדר בקופה. אפשר להשלים אחר כך.
      </p>
      <div>
        <label className="label" htmlFor="supplier-barcode-source">ברקוד בקופה</label>
        <select className="field min-h-11" id="supplier-barcode-source" name="pos_barcode_source" defaultValue={supplier?.pos_barcode_source ?? "internal"}>
          <option value="internal">ברקוד פנימי של החנות</option>
          <option value="supplier">הברקוד או קוד הפריט של הספק</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="supplier-next-barcode">הברקוד הפנימי הבא</label>
        <input className="field" id="supplier-next-barcode" name="pos_next_barcode" dir="ltr" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={28} placeholder="N12000101" defaultValue={supplier?.pos_next_barcode ?? ""} aria-describedby="supplier-barcode-hint" />
      </div>
      <p id="supplier-barcode-hint" className="text-xs text-muted sm:col-span-2">
        אות הספק ומספר רץ, שמתקדם לבד.
      </p>
      <div>
        <label className="label" htmlFor="supplier-price-mode">תמחור</label>
        <select className="field min-h-11" id="supplier-price-mode" name="price_mode" defaultValue={supplier?.price_mode ?? "multiplier"}>
          <option value="multiplier">מחיר מועדון = עלות × מכפלה</option>
          <option value="retail">לפי מחיר הצרכן שמודפס במסמך</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="supplier-multiplier">מכפלה</label>
        <input className="field" id="supplier-multiplier" name="price_multiplier" dir="ltr" inputMode="decimal" placeholder="2.9" defaultValue={supplier?.price_multiplier ?? ""} aria-describedby="supplier-price-hint" />
      </div>
      <p id="supplier-price-hint" className="text-xs text-muted sm:col-span-2">
        מחיר המכירה: מחיר המועדון ועוד 10%.
      </p>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="supplier-notes">הערות</label>
        <textarea className="field" id="supplier-notes" name="notes" rows={2} defaultValue={supplier?.notes ?? ""} />
      </div>
    </div>
  );
}
