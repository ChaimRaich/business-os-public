import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, FileText, FileUp, Plus } from "lucide-react";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENT_STATUS_LABELS, DOCUMENT_TYPE_LABELS } from "@/lib/documents";

export const metadata: Metadata = { title: "קליטת סחורה" };

const STATUS_STYLES = {
  uploaded: "bg-surface-subtle text-muted",
  extracting: "bg-surface-subtle text-muted",
  review: "bg-warning-soft text-warning",
  failed: "bg-danger-soft text-danger",
  approved: "bg-accent-soft text-accent-strong",
} as const;

export default async function ReceivingPage() {
  const { active } = await requireBusiness();
  const supabase = await createClient();
  const { data: documents, error } = await supabase
    .from("documents")
    .select("id, status, doc_type, doc_number, doc_date, supplier_name_raw, created_at, suppliers (name), document_lines (count)")
    .eq("business_id", active.businessId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    throw new Error(`Failed to load documents: ${error.message}`);
  }
  const date = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeZone: "Asia/Jerusalem" });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">קליטת סחורה</h1>
          <p className="mt-0.5 text-sm text-muted">חשבוניות, תעודות משלוח, אימות שורות וייצוא לקופה</p>
        </div>
        <Link href="/receiving/new" className="btn">
          <Plus className="size-4" aria-hidden />
          <span>קליטה חדשה</span>
        </Link>
      </div>

      <section className="card p-2 sm:p-3">
        {documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <span className="mb-3 inline-flex size-12 items-center justify-center rounded-2xl bg-surface-subtle text-muted">
              <FileUp className="size-6" aria-hidden />
            </span>
            <p className="text-sm font-semibold text-ink">עוד לא הועלו מסמכים</p>
            <p className="mt-1 max-w-sm text-sm text-muted">
              צלמו תעודת משלוח או העלו חשבונית, והשורות שלה יופיעו כאן כטבלה לבדיקה ולאישור למלאי.
            </p>
            <Link href="/receiving/new" className="btn mt-4">
              <Plus className="size-4" aria-hidden />
              <span>קליטה חדשה</span>
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {documents.map((document) => (
              <li key={document.id}>
                <Link
                  href={`/receiving/${document.id}`}
                  className="group flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-3 py-3.5 transition-colors hover:bg-surface-subtle/70"
                >
                  <span className="hidden size-10 shrink-0 items-center justify-center rounded-xl bg-surface-subtle text-muted transition-colors group-hover:bg-accent-soft group-hover:text-accent-strong sm:inline-flex">
                    <FileText className="size-4.5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 basis-48">
                    <span className="block truncate font-semibold text-ink group-hover:text-accent-strong">
                      {document.suppliers?.name ?? document.supplier_name_raw ?? "מסמך ללא ספק"}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {[
                        document.doc_type && DOCUMENT_TYPE_LABELS[document.doc_type],
                        document.doc_number,
                        document.doc_date && date.format(new Date(document.doc_date)),
                      ]
                        .filter(Boolean)
                        .join(" · ") || `הועלה ב-${date.format(new Date(document.created_at))}`}
                    </span>
                  </span>
                  {document.status === "review" && (
                    <span className="badge bg-surface-subtle text-muted tabular-nums">
                      {document.document_lines[0]?.count ?? 0} שורות
                    </span>
                  )}
                  <span className={`badge ${STATUS_STYLES[document.status]}`}>
                    {DOCUMENT_STATUS_LABELS[document.status]}
                  </span>
                  <ChevronLeft className="size-4 shrink-0 text-muted/60 transition-transform group-hover:-translate-x-0.5 group-hover:text-accent" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
