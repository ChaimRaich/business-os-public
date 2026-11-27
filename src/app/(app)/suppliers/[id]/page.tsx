import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/components/action-form";
import { SupplierFields } from "@/components/supplier-fields";
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  formatAmount,
  TILL_STATE_LABELS,
  TILL_STATE_STYLES,
  tillState,
} from "@/lib/documents";
import { updateSupplier } from "../actions";

export const metadata: Metadata = { title: "ספק" };

const HISTORY_LIMIT = 50;

export default async function SupplierPage({ params }: PageProps<"/suppliers/[id]">) {
  const { id } = await params;
  const { active } = await requireBusiness();
  const supabase = await createClient();
  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id, name, tax_id, phone, address, pos_code, pos_name, pos_barcode_source, pos_next_barcode, price_mode, price_multiplier, notes, products (id, name)")
    .eq("id", id)
    .eq("business_id", active.businessId)
    .order("name", { referencedTable: "products" })
    .maybeSingle();
  if (!supplier) {
    notFound();
  }

  const { data: documents, error } = await supabase
    .from("documents")
    .select(
      `id, status, doc_type, doc_number, doc_date, created_at,
       document_lines (quantity, unit_cost),
       pos_exports (created_at, confirmed_at, problem_at)`,
    )
    .eq("supplier_id", supplier.id)
    .eq("business_id", active.businessId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) {
    throw new Error(`Failed to load supplier documents: ${error.message}`);
  }
  const date = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeZone: "Asia/Jerusalem" });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/suppliers" className="text-sm text-muted underline-offset-4 hover:underline">
          → כל הספקים
        </Link>
        <h1 className="mt-1 text-3xl sm:text-4xl">{supplier.name}</h1>
      </div>

      <section className="card">
        <h2 className="mb-4 font-semibold">פרטי הספק</h2>
        <ActionForm action={updateSupplier} submitLabel="שמירה" className="flex flex-col gap-4">
          <input type="hidden" name="id" value={supplier.id} />
          <SupplierFields supplier={supplier} />
        </ActionForm>
      </section>

      <section className="card">
        <h2 className="mb-3 font-semibold">היסטוריית קליטות</h2>
        {documents.length === 0 ? (
          <p className="text-sm text-muted">עוד לא נקלט מסמך של הספק הזה.</p>
        ) : (
          <ul className="divide-y divide-line">
            {documents.map((document) => {
              const units = document.document_lines.reduce((sum, line) => sum + (line.quantity ?? 0), 0);
              const cost = document.document_lines.reduce((sum, line) => sum + (line.quantity ?? 0) * (line.unit_cost ?? 0), 0);
              const till = tillState(document.pos_exports);
              return (
                <li key={document.id}>
                  <Link
                    href={`/receiving/${document.id}`}
                    className="-mx-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-2 py-3 hover:bg-canvas"
                  >
                    <span className="min-w-0 flex-1 basis-48">
                      <span className="block truncate font-medium">
                        {[document.doc_type ? DOCUMENT_TYPE_LABELS[document.doc_type] : "מסמך", document.doc_number]
                          .filter(Boolean)
                          .join(" ")}
                      </span>
                      <span className="block text-sm text-muted">
                        {date.format(new Date(document.doc_date ?? document.created_at))} · {formatAmount(units, 0)} יחידות
                        {cost > 0 && <> · <bdi dir="ltr">₪{formatAmount(cost)}</bdi> לפני מע״מ</>}
                      </span>
                    </span>
                    <span className="rounded-full bg-canvas px-3 py-1 text-sm">{DOCUMENT_STATUS_LABELS[document.status]}</span>
                    {document.status === "approved" && (
                      <span className={`rounded-full px-3 py-1 text-sm ${TILL_STATE_STYLES[till]}`}>{TILL_STATE_LABELS[till]}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {documents.length === HISTORY_LIMIT && (
          <p className="mt-3 border-t border-line pt-3 text-sm text-muted">מוצגות {HISTORY_LIMIT} הקליטות האחרונות.</p>
        )}
      </section>

      <section className="card">
        <h2 className="mb-3 font-semibold">מוצרים של הספק</h2>
        {supplier.products.length === 0 ? (
          <p className="text-sm text-muted">עוד לא שויכו מוצרים לספק הזה.</p>
        ) : (
          <ul className="divide-y divide-line">
            {supplier.products.map((product) => (
              <li key={product.id}>
                <Link href={`/products/${product.id}`} className="-mx-2 block rounded-lg px-2 py-3 hover:bg-canvas">
                  {product.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
