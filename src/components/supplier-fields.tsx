type Supplier = {
  name: string;
  tax_id: string | null;
  phone: string | null;
  address: string | null;
  pos_code: string | null;
  pos_name: string | null;
  notes: string | null;
  club_multiplier: number;
  sale_markup_pct: number;
  next_barcode_number: number;
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
        הקוד והשם כפי שהם מוגדרים בקופה. הם ייכנסו לקובץ ה-Excel; אפשר להשלים אותם מאוחר יותר.
      </p>
      <div>
        <label className="label" htmlFor="supplier-club-multiplier">מחיר מועדון = עלות לפני מע״מ כפול</label>
        <input className="field" id="supplier-club-multiplier" name="club_multiplier" dir="ltr" inputMode="decimal" defaultValue={supplier?.club_multiplier ?? 2.9} required />
      </div>
      <div>
        <label className="label" htmlFor="supplier-sale-markup">מחיר מכירה = מועדון ועוד (אחוזים)</label>
        <input className="field" id="supplier-sale-markup" name="sale_markup_pct" dir="ltr" inputMode="decimal" defaultValue={supplier?.sale_markup_pct ?? 10} required />
      </div>
      <div>
        <label className="label" htmlFor="supplier-next-barcode">המספר הרץ הבא לברקוד פנימי</label>
        <input className="field" id="supplier-next-barcode" name="next_barcode_number" dir="ltr" inputMode="numeric" defaultValue={supplier?.next_barcode_number ?? 1} aria-describedby="supplier-barcode-hint" required />
      </div>
      <p id="supplier-barcode-hint" className="self-end text-xs text-muted">
        הברקוד: N, קוד הספק בקופה ו-6 ספרות. אם בקופה כבר יש ברקודים לספק, התחילו אחרי האחרון שבהם: המערכת לא רואה
        את מה שקיים רק בקופה.
      </p>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="supplier-notes">הערות</label>
        <textarea className="field" id="supplier-notes" name="notes" rows={2} defaultValue={supplier?.notes ?? ""} />
      </div>
    </div>
  );
}
