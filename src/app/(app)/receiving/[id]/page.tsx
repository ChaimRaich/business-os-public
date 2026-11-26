import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import {
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPES,
  DOCUMENTS_BUCKET,
  formatAmount,
} from "@/lib/documents";
import { ActionForm } from "@/components/action-form";
import { ExtractionRunner } from "@/components/extraction-runner";
import { LinesEditor, type EditorLine } from "@/components/lines-editor";
import { deleteDocument, openForManualEntry, updateDocumentHeader } from "../actions";
import { RetryExtraction } from "./retry";
import { ApprovedDocument } from "./approved";

export const metadata: Metadata = { title: "קליטה" };

// Printed totals rarely add up to the agora (see SPEC 13.1), so allow half a shekel.
const MONEY_TOLERANCE = 0.5;
const toInput = (value: number | null) => (value === null ? "" : String(value));

export default async function DocumentPage({ params }: PageProps<"/receiving/[id]">) {
  const { id } = await params;
  const { active } = await requireBusiness();
  const supabase = await createClient();

  const { data: document } = await supabase
    .from("documents")
    .select(
      `id, status, approved_at, doc_type, doc_number, doc_date, supplier_id, supplier_name_raw, supplier_tax_id_raw,
       printed_subtotal, printed_total, printed_quantity, extraction_notes, extraction_error, created_at,
       warehouses (name),
       document_files (id, position, storage_path, original_name, mime_type, sha256),
       document_lines (id, position, supplier_sku, barcode, description, variant_text, quantity, unit_cost,
         retail_price, line_total, uncertain_fields, note, match_method,
         sale_price, club_price, product_type, material, guessed_type,
         product_variants (id, label, variant_codes (kind, code),
           products (id, name, sale_price, club_price, product_type, material)))`,
    )
    .eq("id", id)
    .eq("business_id", active.businessId)
    .order("position", { referencedTable: "document_files" })
    .order("position", { referencedTable: "document_lines" })
    .maybeSingle();
  if (!document) {
    notFound();
  }

  const files = await Promise.all(
    document.document_files.map(async (file) => {
      const { data } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(file.storage_path, 3600);
      return { ...file, url: data?.signedUrl ?? null };
    }),
  );

  const title = [
    document.doc_type ? DOCUMENT_TYPE_LABELS[document.doc_type] : "מסמך",
    document.doc_number,
  ]
    .filter(Boolean)
    .join(" ");

  const header = (
    <div>
      <Link href="/receiving" className="text-sm text-muted underline-offset-4 hover:underline">
        → כל הקליטות
      </Link>
      <h1 className="mt-1 text-2xl font-bold">{title}</h1>
      <p className="mt-1 text-sm text-muted">נקלט אל: {document.warehouses.name}</p>
    </div>
  );

  const viewer = (
    <details className="card" open>
      <summary className="cursor-pointer font-semibold">המסמך המקורי ({files.length})</summary>
      <div className="mt-4 flex flex-col gap-4">
        {files.map((file) =>
          !file.url ? (
            <p key={file.id} className="text-sm text-danger">לא הצלחנו לטעון את הקובץ {file.original_name}.</p>
          ) : file.mime_type === "application/pdf" ? (
            <div key={file.id}>
              <a href={file.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-accent underline underline-offset-4">
                פתיחת ה-PDF בחלון חדש
              </a>
              <iframe src={file.url} title={file.original_name ?? "PDF"} className="mt-2 hidden h-[70vh] w-full rounded-lg border border-line sm:block" />
            </div>
          ) : (
            <a key={file.id} href={file.url} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage */}
              <img src={file.url} alt={`עמוד ${file.position} של המסמך`} className="max-h-[80vh] w-full rounded-lg border border-line object-contain" />
            </a>
          ),
        )}
      </div>
    </details>
  );

  const removal = can(active.role, "catalog.delete") && (
    <section className="card border-danger/30">
      <h2 className="font-semibold">מחיקת המסמך</h2>
      <p className="mt-1 mb-4 text-sm text-muted">
        המסמך, הקבצים והשורות שלו יימחקו. המלאי לא מושפע. אי אפשר לבטל את הפעולה.
      </p>
      <ActionForm action={deleteDocument} submitLabel="מחיקת המסמך לצמיתות" pendingLabel="מוחק…" submitClassName="btn-quiet text-danger">
        <input type="hidden" name="id" value={document.id} />
      </ActionForm>
    </section>
  );

  if (document.status === "uploaded" || document.status === "extracting") {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ExtractionRunner documentId={document.id} alreadyRunning={document.status === "extracting"} />
        {viewer}
      </div>
    );
  }

  if (document.status === "failed") {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <section className="card border-danger/30" role="alert">
          <h2 className="font-semibold text-danger">לא הצלחנו לקרוא את המסמך</h2>
          <p className="mt-2 text-sm">{document.extraction_error}</p>
          <p className="mt-1 text-sm text-muted">שום דבר לא נשמר למלאי. הקובץ המקורי שמור.</p>
          <div className="mt-4 flex flex-wrap items-start gap-3">
            <RetryExtraction documentId={document.id} />
            <ActionForm action={openForManualEntry} submitLabel="הזנת השורות ידנית" submitClassName="btn-quiet">
              <input type="hidden" name="id" value={document.id} />
            </ActionForm>
          </div>
        </section>
        {viewer}
        {removal}
      </div>
    );
  }

  if (document.status === "approved") {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ApprovedDocument documentId={document.id} businessId={active.businessId} approvedAt={document.approved_at} />
        {viewer}
      </div>
    );
  }

  // --- Review -----------------------------------------------------------------

  const lines = document.document_lines;
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name, club_multiplier, sale_markup_pct")
    .eq("business_id", active.businessId)
    .order("name");
  const supplier = suppliers?.find((s) => s.id === document.supplier_id);

  // For unmatched lines: products that already carry the same supplier SKU.
  const unknownSkus = lines.flatMap((line) =>
    !line.product_variants && line.supplier_sku ? [line.supplier_sku.toUpperCase()] : [],
  );
  const { data: skuCodes } =
    document.supplier_id && unknownSkus.length > 0
      ? await supabase
          .from("variant_codes")
          .select("code_norm, product_variants (products (id, name))")
          .eq("business_id", active.businessId)
          .eq("kind", "supplier_sku")
          .eq("supplier_id", document.supplier_id)
          .in("code_norm", unknownSkus)
      : { data: [] };
  const productsForSku = (sku: string | null) => {
    const products = (skuCodes ?? [])
      .filter((code) => code.code_norm === sku?.toUpperCase())
      .map((code) => code.product_variants.products);
    return [...new Map(products.map((product) => [product.id, product])).values()];
  };

  const fingerprints = files.map((file) => file.sha256);
  const [{ data: sameFile }, { data: sameNumber }] = await Promise.all([
    supabase
      .from("document_files")
      .select("document_id")
      .eq("business_id", active.businessId)
      .in("sha256", fingerprints)
      .neq("document_id", document.id)
      .limit(1),
    document.supplier_id && document.doc_number
      ? supabase
          .from("documents")
          .select("id")
          .eq("business_id", active.businessId)
          .eq("supplier_id", document.supplier_id)
          .eq("doc_number", document.doc_number)
          .neq("id", document.id)
          .limit(1)
      : Promise.resolve({ data: [] as { id: string }[] }),
  ]);
  const duplicateId = sameFile?.[0]?.document_id ?? sameNumber?.[0]?.id ?? null;

  const warnings: string[] = [];
  const quantitySum = lines.reduce((sum, line) => sum + (line.quantity ?? 0), 0);
  if (document.printed_quantity !== null && Math.abs(quantitySum - document.printed_quantity) > 0.001) {
    warnings.push(
      `סך הכמויות בשורות (${formatAmount(quantitySum, 0)}) שונה מסך הפריטים שמודפס במסמך (${formatAmount(document.printed_quantity, 0)}). ייתכן שחסרה שורה או שכמות נקראה לא נכון.`,
    );
  }
  if (lines.length > 0 && lines.every((line) => line.line_total !== null)) {
    const totalSum = lines.reduce((sum, line) => sum + (line.line_total ?? 0), 0);
    const printed = [document.printed_total, document.printed_subtotal].filter((v): v is number => v !== null);
    if (printed.length > 0 && !printed.some((value) => Math.abs(value - totalSum) <= MONEY_TOLERANCE)) {
      warnings.push(
        `סכום השורות (₪${formatAmount(totalSum)}) לא תואם לסכום שמודפס במסמך (₪${formatAmount(printed[0])}).`,
      );
    }
  } else if (document.printed_subtotal !== null && lines.every((line) => line.quantity !== null && line.unit_cost !== null)) {
    const costSum = lines.reduce((sum, line) => sum + (line.quantity ?? 0) * (line.unit_cost ?? 0), 0);
    // Unit prices are printed rounded, so allow a little drift per line as well.
    if (Math.abs(costSum - document.printed_subtotal) > MONEY_TOLERANCE + lines.length * 0.01) {
      warnings.push(
        `עלות השורות לפני מע״מ (₪${formatAmount(costSum)}) לא תואמת לסיכום הביניים שבמסמך (₪${formatAmount(document.printed_subtotal)}).`,
      );
    }
  }
  const missingQuantity = lines.filter((line) => line.quantity === null).length;
  if (missingQuantity > 0) {
    warnings.push(`ב-${missingQuantity} שורות חסרה כמות. צריך להשלים אותה לפי המסמך.`);
  }
  const flagged = lines.filter((line) => line.uncertain_fields.length > 0).length;
  const unmatched = lines.filter((line) => !line.product_variants).length;

  const editorLines: EditorLine[] = lines.map((line) => ({
    key: line.id,
    id: line.id,
    supplier_sku: line.supplier_sku ?? "",
    barcode: line.barcode ?? "",
    description: line.description ?? "",
    variant_text: line.variant_text ?? "",
    quantity: toInput(line.quantity),
    unit_cost: toInput(line.unit_cost),
    retail_price: toInput(line.retail_price),
    uncertain: line.uncertain_fields,
    note: line.note,
    sale_price: toInput(line.sale_price),
    club_price: toInput(line.club_price),
    product_type: line.product_type ?? "",
    material: line.material ?? "",
    guessedType: line.guessed_type,
    skuProducts: line.product_variants ? [] : productsForSku(line.supplier_sku),
    match: line.product_variants
      ? {
          variantId: line.product_variants.id,
          posCode: line.product_variants.variant_codes.find((code) => code.kind === "pos")?.code ?? null,
          salePrice: line.product_variants.products.sale_price,
          clubPrice: line.product_variants.products.club_price,
          productType: line.product_variants.products.product_type,
          material: line.product_variants.products.material,
          productId: line.product_variants.products.id,
          productName: line.product_variants.products.name,
          variantLabel: line.product_variants.label,
          method: line.match_method ?? "barcode",
        }
      : null,
    saved: true,
  }));

  return (
    <div className="flex flex-col gap-6">
      {header}

      {duplicateId && (
        <p className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
          נראה שהמסמך הזה כבר הועלה בעבר.{" "}
          <Link href={`/receiving/${duplicateId}`} className="font-semibold underline underline-offset-4">
            פתיחת ההעלאה הקודמת
          </Link>
        </p>
      )}

      <section className="card">
        <h2 className="font-semibold">מה לבדוק</h2>
        {warnings.length === 0 && flagged === 0 ? (
          <p className="mt-2 text-sm text-muted">
            {lines.length === 0
              ? "לא נקראו שורות מהמסמך."
              : "הכמויות והסכומים מתיישבים עם מה שמודפס במסמך. כדאי בכל זאת לעבור על השורות מול המקור."}
          </p>
        ) : (
          <ul className="mt-2 flex list-disc flex-col gap-1 ps-5 text-sm">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
            {flagged > 0 && <li>{flagged} שורות מסומנות בצהוב: ערכים שלא נקראו בוודאות.</li>}
          </ul>
        )}
        {lines.length > 0 && (
          <p className="mt-2 text-sm text-muted">
            {unmatched === 0
              ? "כל השורות זוהו בקטלוג."
              : `${unmatched} מתוך ${lines.length} שורות עוד לא קיימות בקטלוג.`}
          </p>
        )}
        {document.extraction_notes && (
          <p className="mt-3 border-t border-line pt-3 text-sm text-muted">
            הערת הקריאה: {document.extraction_notes}
          </p>
        )}
        <p className="mt-3 text-sm text-muted">המלאי יתעדכן רק אחרי אישור הקליטה, בתחתית העמוד.</p>
      </section>

      <section className="card">
        <h2 className="mb-4 font-semibold">פרטי המסמך</h2>
        <ActionForm action={updateDocumentHeader} submitLabel="שמירת הפרטים" submitClassName="btn-quiet sm:self-start" className="flex flex-col gap-4">
          <input type="hidden" name="id" value={document.id} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label" htmlFor="supplier_id">ספק</label>
              <select className="field min-h-11" id="supplier_id" name="supplier_id" defaultValue={document.supplier_id ?? ""}>
                <option value="">לא נבחר</option>
                {(suppliers ?? []).map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="doc_type">סוג מסמך</label>
              <select className="field min-h-11" id="doc_type" name="doc_type" defaultValue={document.doc_type ?? ""}>
                <option value="">לא ידוע</option>
                {DOCUMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {DOCUMENT_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="doc_number">מספר מסמך</label>
              <input className="field" id="doc_number" name="doc_number" dir="ltr" defaultValue={document.doc_number ?? ""} />
            </div>
            <div>
              <label className="label" htmlFor="doc_date">תאריך</label>
              <input className="field" id="doc_date" name="doc_date" type="date" defaultValue={document.doc_date ?? ""} />
            </div>
          </div>
          {!document.supplier_id && document.supplier_name_raw && (
            <p className="text-sm text-muted">
              במסמך מופיע הספק ״{document.supplier_name_raw}״
              {document.supplier_tax_id_raw && (
                <> (ח.פ. <bdi dir="ltr">{document.supplier_tax_id_raw}</bdi>)</>
              )}
              , והוא לא נמצא ברשימת הספקים.{" "}
              <Link href="/suppliers" className="font-medium text-accent underline underline-offset-4">
                הוספת ספק
              </Link>
            </p>
          )}
        </ActionForm>
      </section>

      {viewer}
      <LinesEditor
        documentId={document.id}
        initialLines={editorLines}
        rule={supplier ? { clubMultiplier: supplier.club_multiplier, saleMarkupPct: supplier.sale_markup_pct } : null}
        duplicate={duplicateId !== null}
      />
      {removal}
    </div>
  );
}
