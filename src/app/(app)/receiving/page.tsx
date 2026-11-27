import type { Metadata } from "next";
import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  TILL_STATE_LABELS,
  TILL_STATE_STYLES,
  tillState,
} from "@/lib/documents";

export const metadata: Metadata = { title: "קליטת סחורה" };

const STATUS_STYLES = {
  uploaded: "bg-canvas text-muted",
  extracting: "bg-canvas text-muted",
  review: "bg-accent-soft text-accent-strong",
  failed: "bg-danger-soft text-danger",
  approved: "bg-canvas text-ink",
} as const;

export default async function ReceivingPage() {
  const { active } = await requireBusiness();
  const supabase = await createClient();
  const { data: documents, error } = await supabase
    .from("documents")
    .select("id, status, doc_type, doc_number, doc_date, supplier_name_raw, created_at, suppliers (name), document_lines (count), pos_exports (created_at, confirmed_at, problem_at)")
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
        <h1 className="text-3xl sm:text-4xl">קליטת סחורה</h1>
        <Link href="/receiving/new" className="btn">
          קליטה חדשה
        </Link>
      </div>

      <section className="card">
        {documents.length === 0 ? (
          <p className="text-sm text-muted">
            עוד לא הועלו מסמכים.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {documents.map((document) => (
              <li key={document.id}>
                <Link
                  href={`/receiving/${document.id}`}
                  className="-mx-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-2 py-3 hover:bg-canvas"
                >
                  <span className="min-w-0 flex-1 basis-48">
                    <span className="block truncate font-medium">
                      {document.suppliers?.name ?? document.supplier_name_raw ?? "מסמך ללא ספק"}
                    </span>
                    <span className="block text-sm text-muted">
                      {[
                        document.doc_type && DOCUMENT_TYPE_LABELS[document.doc_type],
                        document.doc_number,
                        document.doc_date && date.format(new Date(document.doc_date)),
                      ]
                        .filter(Boolean)
                        .join(" · ") || `הועלה ב-${date.format(new Date(document.created_at))}`}
                    </span>
                  </span>
                  {(document.status === "review" || document.status === "approved") && (
                    <span className="text-sm text-muted">{document.document_lines[0]?.count ?? 0} שורות</span>
                  )}
                  <span className={`rounded-full px-3 py-1 text-sm ${STATUS_STYLES[document.status]}`}>
                    {DOCUMENT_STATUS_LABELS[document.status]}
                  </span>
                  {document.status === "approved" && (
                    <span className={`rounded-full px-3 py-1 text-sm ${TILL_STATE_STYLES[tillState(document.pos_exports)]}`}>
                      {TILL_STATE_LABELS[tillState(document.pos_exports)]}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
