import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { ActionForm } from "@/components/action-form";
import { PosDepartmentFields } from "@/components/pos-department-fields";
import { SupplierTillForm } from "@/components/supplier-till-form";
import { ExportItem } from "@/components/export-item";
import { PosExportEditor, type ExportEditorRow } from "@/components/pos-export-editor";
import { suggestDepartment, suggestPrices } from "@/lib/pos-export";
import { DEFAULT_DEPARTMENT } from "@/lib/till-defaults";
import { addPosDepartment } from "../../../actions";
import { fillTillDefaults } from "../../actions";

export const metadata: Metadata = { title: "קובץ לקופה" };

export default async function ExportPage({ params }: PageProps<"/receiving/[id]/export">) {
  const { id } = await params;
  const { active } = await requireBusiness();
  const supabase = await createClient();

  const [{ data: document }, { data: departments }, { data: exports }] = await Promise.all([
    supabase
      .from("documents")
      .select(
        `id, status, doc_number,
         suppliers (id, name, pos_code, pos_name, pos_barcode_source, pos_next_barcode, price_mode, price_multiplier),
         document_lines (position, quantity, unit_cost, retail_price, supplier_sku, barcode,
           product_variants (id, label, club_price, sale_price,
             variant_codes (kind, code),
             products (name, pos_item_name, pos_department_id)))`,
      )
      .eq("id", id)
      .eq("business_id", active.businessId)
      .order("position", { referencedTable: "document_lines" })
      .maybeSingle(),
    supabase
      .from("pos_departments")
      .select("id, code, department, sub_department, item_name")
      .eq("business_id", active.businessId)
      .order("code"),
    supabase
      .from("pos_exports")
      .select("id, document_id, row_count, created_at, confirmed_at, problem_at, problem_note")
      .eq("document_id", id)
      .eq("business_id", active.businessId)
      .order("created_at", { ascending: false }),
  ]);
  if (!document || document.status !== "approved") {
    notFound();
  }
  const supplier = document.suppliers;

  // One file row per item: the same item on several lines is summed.
  const rows = new Map<string, ExportEditorRow & { retail: number | null }>();
  for (const line of document.document_lines) {
    const variant = line.product_variants;
    if (!variant) continue;
    const existing = rows.get(variant.id);
    if (existing) {
      existing.quantity += line.quantity ?? 0;
      existing.cost ??= line.unit_cost;
      existing.retail ??= line.retail_price;
      continue;
    }
    rows.set(variant.id, {
      variantId: variant.id,
      title: [variant.products.name, variant.label].filter(Boolean).join(" · "),
      codes: [line.supplier_sku, line.barcode].filter(Boolean).join(" · "),
      posCode: variant.variant_codes.find((code) => code.kind === "pos")?.code ?? null,
      quantity: line.quantity ?? 0,
      cost: line.unit_cost,
      retail: line.retail_price,
      itemName: variant.products.pos_item_name ?? "",
      departmentId: variant.products.pos_department_id ?? "",
      clubPrice: variant.club_price === null ? "" : String(variant.club_price),
      salePrice: variant.sale_price === null ? "" : String(variant.sale_price),
    });
  }
  let guessedDepartments = 0;
  const editorRows = [...rows.values()].map(({ retail, ...found }) => {
    let row: ExportEditorRow = found;
    if (!row.departmentId) {
      // A shop with a single department has nothing to choose between.
      const guess = departments?.length === 1 ? departments[0] : suggestDepartment(row.title, departments ?? []);
      if (guess) {
        guessedDepartments += 1;
        row = { ...row, departmentId: guess.id, itemName: row.itemName || (guess.item_name ?? row.title.slice(0, 80)) };
      }
    }
    if (row.clubPrice && row.salePrice) return row;
    const suggested = supplier
      ? suggestPrices({ mode: supplier.price_mode === "retail" ? "retail" : "multiplier", multiplier: supplier.price_multiplier }, row.cost, retail)
      : null;
    return suggested ? { ...row, clubPrice: String(suggested.club), salePrice: String(suggested.sale) } : row;
  });

  // What the till file needs and nobody has entered yet. Asked for right here, so the
  // way to the file never leaves this screen.
  const needsBarcodes = editorRows.some((row) => !row.posCode);
  const supplierIncomplete =
    !!supplier &&
    (!supplier.pos_code ||
      !supplier.pos_name ||
      (needsBarcodes && supplier.pos_barcode_source === "internal" && !supplier.pos_next_barcode));
  const noDepartments = (departments ?? []).length === 0;
  const blocked = !supplier || supplierIncomplete || noDepartments;
  const canAddDepartments = can(active.role, "warehouses.manage");
  // A supplier that prints a consumer price on every row most likely sells by it.
  const allRetail = rows.size > 0 && [...rows.values()].every((row) => row.retail);
  const priceMode = supplier?.price_mode === "retail" || (!supplier?.price_multiplier && allRetail) ? "retail" : "multiplier";
  const unpriced = editorRows.filter((row) => !row.clubPrice).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/receiving/${id}`} className="text-sm text-muted underline-offset-4 hover:underline">
          → חזרה למסמך
        </Link>
        <h1 className="mt-1 text-3xl sm:text-4xl">קובץ לקופה{document.doc_number && ` · מסמך ${document.doc_number}`}</h1>
        <p className="mt-1 text-sm text-muted">
          הורדת הקובץ לא משנה את המלאי.
        </p>
      </div>

      {(exports ?? []).length > 0 && (
        <section className="card">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">קבצים שהוכנו</h2>
            <Link href="/exports" className="text-sm text-muted underline-offset-4 hover:underline">
              כל הקבצים לקופה
            </Link>
          </div>
          <ul className="mt-1 divide-y divide-line">
            {(exports ?? []).map((item) => (
              <ExportItem key={item.id} item={item} />
            ))}
          </ul>
        </section>
      )}

      {blocked ? (
        <section className="card ring-2 ring-accent/40">
          <p className="text-xs font-semibold text-muted">השלב הבא</p>
          <h2 className="mt-0.5 text-lg font-semibold">השלמת הפרטים שהקופה דורשת</h2>
          <p className="mt-1 text-sm text-muted">
            הקופה דורשת קוד ספק, ברקוד ומחלקה. ממלאים פעם אחת, וזה נשמר לקליטות הבאות.
          </p>
          {supplier && (
            <div className="mt-4">
              <ActionForm action={fillTillDefaults} submitLabel="מילוי אוטומטי והמשך לקובץ ←" pendingLabel="ממלא…" submitClassName="btn btn-lg max-sm:w-full">
                <input type="hidden" name="id" value={id} />
              </ActionForm>
              <p className="mt-2 text-sm text-muted">
                הספק בשמו עם קוד פנוי, ברקוד של הספק או מספר רץ, ומחלקה אחת: {DEFAULT_DEPARTMENT.department}. או ידנית:
              </p>
            </div>
          )}

          {!supplier && (
            <p className="mt-4 border-t border-line pt-4 text-sm" role="alert">
              למסמך לא נבחר ספק.{" "}
              <Link href="/suppliers" className="font-medium text-accent underline underline-offset-4">
                לרשימת הספקים
              </Link>
            </p>
          )}

          {supplier && supplierIncomplete && (
            <div className="mt-4 border-t border-line pt-4">
              <h3 className="font-semibold">הספק {supplier.name} בקופה</h3>
              <SupplierTillForm
                supplierId={supplier.id}
                initial={{
                  pos_code: supplier.pos_code ?? "",
                  pos_name: supplier.pos_name ?? "",
                  pos_barcode_source: supplier.pos_barcode_source,
                  pos_next_barcode: supplier.pos_next_barcode ?? "",
                  price_mode: priceMode,
                  price_multiplier: supplier.price_multiplier === null ? "" : String(supplier.price_multiplier),
                }}
              />
            </div>
          )}

          {noDepartments && (
            <div className="mt-4 border-t border-line pt-4">
              <h3 className="font-semibold">מחלקות הקופה</h3>
              <p className="mt-1 text-sm text-muted">
                הקוד והשמות בדיוק כמו בקופה.
              </p>
              {canAddDepartments ? (
                <ActionForm action={addPosDepartment} submitLabel="הוספת מחלקה" pendingLabel="מוסיף…" className="mt-3 flex flex-wrap items-end gap-3">
                  <PosDepartmentFields />
                </ActionForm>
              ) : (
                <p className="mt-2 text-sm">מחלקות מגדירים בעלים או מנהל של העסק, במסך ההגדרות.</p>
              )}
            </div>
          )}
        </section>
      ) : (
        <>
          <section className="card">
            <h2 className="font-semibold">{(exports ?? []).length > 0 ? "הכנת קובץ נוסף" : "לפני שיוצרים את הקובץ"}</h2>
            <ul className="mt-2 flex list-disc flex-col gap-1 ps-5 text-sm text-muted">
              <li>
                {supplier?.pos_barcode_source === "supplier"
                  ? "ברקוד: לפי הספק (הברקוד שלו, ואם אין, קוד הפריט שלו)."
                  : <>ברקוד: פנימי. הבא בתור: <bdi dir="ltr" className="font-mono text-ink">{supplier?.pos_next_barcode}</bdi>. פריט שכבר קיבל ברקוד שומר עליו.</>}
              </li>
              <li>
                {supplier?.price_mode === "retail"
                  ? "מחירים: לפי מחיר הצרכן שבמסמך."
                  : supplier?.price_multiplier
                    ? `מחירים: מחיר מועדון = עלות × ${supplier.price_multiplier}, מחיר מכירה = מועדון + 10%, בשקלים שלמים.`
                    : "מחירים: אין מכפלה לספק. מקלידים מחיר מועדון בכל שורה."}
              </li>
              {guessedDepartments > 0 && (
                <li className="text-ink">
                  מחלקה ושם פריט הוצעו ל-{guessedDepartments} מתוך {editorRows.length} שורות. כדאי לבדוק אותם.
                </li>
              )}
              {unpriced > 0 && (supplier?.price_mode === "retail" || supplier?.price_multiplier) && (
                <li className="text-ink">ב-{unpriced} שורות חסר נתון לחישוב המחיר.</li>
              )}
              {editorRows.some((row) => row.posCode) && (
                <li className="text-ink">
                  חלק מהפריטים כבר נשלחו לקופה. לא ידוע אם היא מוסיפה לכמות או מחליפה אותה: בדקו על פריט אחד.
                </li>
              )}
            </ul>
          </section>
          {canAddDepartments && (
            <details className="card">
              <summary className="cursor-pointer font-semibold">חסרה מחלקה ברשימה? הוספת מחלקה</summary>
              <ActionForm action={addPosDepartment} submitLabel="הוספת מחלקה" pendingLabel="מוסיף…" submitClassName="btn-quiet" className="mt-4 flex flex-wrap items-end gap-3">
                <PosDepartmentFields />
              </ActionForm>
            </details>
          )}
          <PosExportEditor
            documentId={id}
            initialRows={editorRows}
            departments={(departments ?? []).map((department) => ({
              id: department.id,
              label: `${department.code} · ${department.department} / ${department.sub_department}`,
              itemName: department.item_name,
            }))}
          />
        </>
      )}
    </div>
  );
}
