import { createClient } from "@/lib/supabase/server";
import { PRODUCT_TYPE_LABELS, PRODUCT_TYPES } from "@/lib/pricing";
import { ActionForm } from "@/components/action-form";
import { fillSampleDepartments, saveDepartment } from "@/app/(app)/actions";

const FIELDS = [
  { name: "code", label: "קוד מחלקה", width: "w-24" },
  { name: "department", label: "מחלקה", width: "min-w-0 flex-1 basis-32" },
  { name: "sub_department", label: "תת מחלקה", width: "min-w-0 flex-1 basis-32" },
] as const;

/** The POS department of each product type, used in the Excel file. */
export async function DepartmentsSettings({ businessId, canManage }: { businessId: string; canManage: boolean }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("departments")
    .select("product_type, code, department, sub_department")
    .eq("business_id", businessId);
  if (error) {
    throw new Error(`Failed to load departments: ${error.message}`);
  }

  return (
    <section id="departments" className="card">
      <h2 className="font-semibold">מחלקות בקופה</h2>
      <p className="mt-1 mb-2 text-sm text-muted">
        לכל סוג מוצר: הקוד והשמות כפי שהם מוגדרים בקופה. בלעדיהם אי אפשר ליצור קובץ לקופה.
      </p>
      <ul className="divide-y divide-line">
        {PRODUCT_TYPES.map((type) => {
          const row = data.find((d) => d.product_type === type);
          return (
            <li key={type} className="py-3">
              <p className="mb-2 text-sm font-medium">{PRODUCT_TYPE_LABELS[type]}</p>
              {canManage ? (
                <ActionForm
                  // Remounts when the stored values change, so the inputs show them.
                  key={JSON.stringify(row ?? null)}
                  action={saveDepartment}
                  submitLabel="שמירה"
                  submitClassName="btn-quiet"
                  className="flex flex-wrap items-end gap-2"
                >
                  <input type="hidden" name="product_type" value={type} />
                  {FIELDS.map((field) => (
                    <div key={field.name} className={field.width}>
                      <label className="label" htmlFor={`${field.name}-${type}`}>{field.label}</label>
                      <input className="field py-2" id={`${field.name}-${type}`} name={field.name} maxLength={80} defaultValue={row?.[field.name] ?? ""} />
                    </div>
                  ))}
                </ActionForm>
              ) : (
                <p className="text-sm text-muted">
                  {row ? `${row.code} · ${row.department} · ${row.sub_department}` : "לא הוגדר"}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {canManage && data.length === 0 && (
        <ActionForm action={fillSampleDepartments} submitLabel="מילוי לפי קובץ הדוגמה (טבעות, עגילים, שרשראות)" submitClassName="btn-quiet" className="mt-2 flex flex-wrap items-center gap-3" />
      )}
    </section>
  );
}
