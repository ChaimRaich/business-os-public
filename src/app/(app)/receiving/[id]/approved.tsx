import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadExportData } from "@/lib/export-data";
import { planExport } from "@/lib/pos-export";
import { formatAmount } from "@/lib/documents";
import { MATERIAL_LABELS, PRODUCT_TYPE_LABELS } from "@/lib/pricing";
import { formatDateTime, formatQuantity, itemTitle } from "@/lib/stock";
import { ActionForm } from "@/components/action-form";
import { createPosExport, fillLineCost, markExportUploaded } from "../actions";

/** An approved receipt: read-only lines, and the POS file. */
export async function ApprovedDocument({
  documentId,
  businessId,
  approvedAt,
}: {
  documentId: string;
  businessId: string;
  approvedAt: string | null;
}) {
  const supabase = await createClient();
  const [{ data: document, error }, { data: record, error: recordError }] = await Promise.all([
    supabase
      .from("documents")
      .select(
        `warehouse_id, suppliers (name),
         document_lines (id, position, description, quantity, unit_cost, sale_price, club_price, product_type, material,
           product_variants (id, label, variant_codes (kind, code), products (id, name)))`,
      )
      .eq("id", documentId)
      .eq("business_id", businessId)
      .order("position", { referencedTable: "document_lines" })
      .single(),
    supabase
      .from("pos_exports")
      .select("file_name, row_count, created_at, pos_status, uploaded_at")
      .eq("document_id", documentId)
      .eq("business_id", businessId)
      .maybeSingle(),
  ]);
  if (error || recordError) {
    throw new Error(`Failed to load the approved document: ${(error ?? recordError)!.message}`);
  }

  const data = record ? null : await loadExportData(supabase, businessId, documentId);
  const plan = data ? planExport({ ...data.input, barcodesPending: true }) : null;
  const missingCost = record ? [] : document.document_lines.filter((line) => line.unit_cost === null);

  return (
    <>
      <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-strong">
        הקליטה אושרה{approvedAt && ` ב-${formatDateTime(approvedAt)}`} והמלאי עודכן. השורות נעולות לעריכה.
        {document.suppliers && ` ספק: ${document.suppliers.name}.`}
      </p>

      <section className="card">
        <h2 className="mb-3 font-semibold">קובץ לקופה</h2>
        {record ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm">
              הקובץ נוצר ב-{formatDateTime(record.created_at)}, {record.row_count} פריטים. הורדה חוזרת מחזירה את
              אותו קובץ ולא משנה את המלאי.
            </p>
            {/* A plain link: the route answers with a file, not a page. */}
            <a href={`/receiving/${documentId}/export`} download className="btn self-start">
              הורדת קובץ לקופה
            </a>
            {record.pos_status === "uploaded" ? (
              <p className="text-sm font-medium text-accent">
                ✓ הועלה לקופה בהצלחה{record.uploaded_at && ` (סומן ב-${formatDateTime(record.uploaded_at)})`}
              </p>
            ) : (
              <ActionForm action={markExportUploaded} submitLabel="סימון: הועלה לקופה בהצלחה" submitClassName="btn-quiet" className="flex flex-col items-start gap-2 border-t border-line pt-4">
                <input type="hidden" name="id" value={documentId} />
                <p className="text-sm">
                  סטטוס בקופה: <strong>ממתין</strong>. יצירה או הורדה של הקובץ אינן אישור שהקופה קלטה אותו.
                </p>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="confirm" className="mt-1" />
                  העליתי את הקובץ לקופה והיא קלטה אותו.
                </label>
              </ActionForm>
            )}
          </div>
        ) : !data || !plan ? (
          <p className="text-sm text-danger">לא הצלחנו להכין את נתוני הקובץ. בדקו שלמסמך יש ספק ושכל השורות משויכות.</p>
        ) : plan.problems.length > 0 ? (
          <div>
            <p className="text-sm">אי אפשר ליצור את הקובץ עד שכל הפרטים האלה יושלמו:</p>
            <ul className="mt-2 flex list-disc flex-col gap-1 ps-5 text-sm">
              {plan.problems.map((problem) => (
                <li key={problem.message}>
                  {problem.message}{" "}
                  <Link href={problem.href.startsWith("#") ? `/receiving/${documentId}${problem.href}` : problem.href} className="font-medium text-accent underline underline-offset-4">
                    {problem.action}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ActionForm action={createPosExport} submitLabel="יצירת קובץ לקופה" pendingLabel="יוצר…" submitClassName="btn" className="flex flex-col items-start gap-3">
            <input type="hidden" name="id" value={documentId} />
            <p className="text-sm text-muted">כל הפרטים מלאים. הקובץ נוצר פעם אחת ונשמר.</p>
            {data.existingInPos.length > 0 && (
              <div className="rounded-lg border border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-semibold">⚠ ייתכן שהפריטים האלה כבר קיימים בקופה:</p>
                <ul className="mt-1 list-disc ps-5">
                  {data.existingInPos.map((title, index) => (
                    <li key={index}>{title}</li>
                  ))}
                </ul>
                <p className="mt-2">
                  עדיין לא ידוע אם העלאה של ברקוד קיים מוסיפה לכמות בקופה, מחליפה אותה או נדחית. בדקו זאת על
                  פריט אחד לפני שמעלים את כל הקובץ.
                </p>
                <label className="mt-2 flex items-start gap-2">
                  <input type="checkbox" name="confirm_existing" className="mt-1" />
                  הבנתי, ליצור את הקובץ עם הפריטים האלה.
                </label>
              </div>
            )}
          </ActionForm>
        )}
      </section>

      {missingCost.length > 0 && (
        <section id="missing-cost" className="card">
          <h2 className="font-semibold">השלמת עלות חסרה</h2>
          <p className="mt-1 mb-3 text-sm text-muted">
            אפשר למלא עלות שלא הוזנה. עלות קיימת וכמויות אי אפשר לשנות.
          </p>
          {missingCost.map((line) => (
            <ActionForm key={line.id} action={fillLineCost} submitLabel="שמירה" submitClassName="btn-quiet" className="flex flex-wrap items-end gap-3 py-2">
              <input type="hidden" name="line_id" value={line.id} />
              <div className="min-w-0 flex-1 basis-48">
                <label className="label" htmlFor={`cost-${line.id}`}>
                  שורה {line.position}: {line.product_variants?.products.name ?? line.description}
                </label>
                <input className="field" id={`cost-${line.id}`} name="unit_cost" dir="ltr" inputMode="decimal" required />
              </div>
            </ActionForm>
          ))}
        </section>
      )}

      <section className="card">
        <h2 className="mb-3 font-semibold">שורות הקליטה</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="text-muted">
              <tr className="border-b border-line text-right">
                {["#", "פריט", "ברקוד בקופה", "כמות", "עלות", "מכירה", "מועדון", "סיווג", ""].map((heading, index) => (
                  <th key={index} className="px-2 py-2 text-right font-medium">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {document.document_lines.map((line) => {
                const variant = line.product_variants;
                return (
                  <tr key={line.id}>
                    <td className="px-2 py-2 tabular-nums text-muted">{line.position}</td>
                    <td className="px-2 py-2">
                      {variant ? (
                        <Link href={`/products/${variant.products.id}`} className="underline underline-offset-2">
                          {itemTitle(variant.products.name, variant.label)}
                        </Link>
                      ) : (
                        line.description
                      )}
                    </td>
                    <td className="px-2 py-2 font-mono">
                      <bdi dir="ltr">{variant?.variant_codes.find((code) => code.kind === "pos")?.code ?? "—"}</bdi>
                    </td>
                    <td className="px-2 py-2 tabular-nums">{line.quantity === null ? "" : formatQuantity(line.quantity)}</td>
                    <td className="px-2 py-2 tabular-nums">{formatAmount(line.unit_cost) || "—"}</td>
                    <td className="px-2 py-2 tabular-nums">{formatAmount(line.sale_price) || "—"}</td>
                    <td className="px-2 py-2 tabular-nums">{formatAmount(line.club_price) || "—"}</td>
                    <td className="px-2 py-2">
                      {[
                        line.product_type && PRODUCT_TYPE_LABELS[line.product_type],
                        line.material && MATERIAL_LABELS[line.material],
                      ].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td className="px-2 py-2">
                      {variant && (
                        <Link
                          href={`/stock/adjust?variant=${variant.id}&warehouse=${document.warehouse_id}&document=${documentId}`}
                          className="whitespace-nowrap text-accent underline underline-offset-2"
                        >
                          התאמת מלאי
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
