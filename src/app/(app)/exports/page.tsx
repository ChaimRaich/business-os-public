import type { Metadata } from "next";
import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENT_TYPE_LABELS, exportState, type ExportState } from "@/lib/documents";
import { ExportItem } from "@/components/export-item";

export const metadata: Metadata = { title: "ייצוא והיסטוריה" };

const LIMIT = 200;
const FILTERS: { value: ExportState | "all"; label: string }[] = [
  { value: "all", label: "הכול" },
  { value: "pending", label: "ממתינים" },
  { value: "problem", label: "תקלות" },
  { value: "confirmed", label: "נקלטו" },
];

export default async function ExportsPage({ searchParams }: PageProps<"/exports">) {
  const { status } = await searchParams;
  const wanted = Array.isArray(status) ? status[0] : status;
  const filter = FILTERS.find((item) => item.value === wanted)?.value ?? "all";

  const { active } = await requireBusiness();
  const supabase = await createClient();
  const [{ data: exports, error }, { data: approved, error: approvedError }] = await Promise.all([
    supabase
      .from("pos_exports")
      .select(
        `id, document_id, row_count, created_at, confirmed_at, problem_at, problem_note,
         documents (doc_type, doc_number, supplier_name_raw, suppliers (name))`,
      )
      .eq("business_id", active.businessId)
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    supabase
      .from("documents")
      .select("id, doc_type, doc_number, approved_at, supplier_name_raw, suppliers (name), pos_exports (id)")
      .eq("business_id", active.businessId)
      .eq("status", "approved")
      .order("approved_at", { ascending: false })
      .limit(LIMIT),
  ]);
  if (error || approvedError) {
    throw new Error(`Failed to load exports: ${(error ?? approvedError)?.message}`);
  }

  const counts = { all: exports.length, pending: 0, problem: 0, confirmed: 0 };
  for (const item of exports) {
    counts[exportState(item)] += 1;
  }
  const shown = filter === "all" ? exports : exports.filter((item) => exportState(item) === filter);
  const withoutFile = approved.filter((document) => document.pos_exports.length === 0);
  const date = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeZone: "Asia/Jerusalem" });
  const describe = (document: { doc_type: keyof typeof DOCUMENT_TYPE_LABELS | null; doc_number: string | null; supplier_name_raw: string | null; suppliers: { name: string } | null }) =>
    [
      document.suppliers?.name ?? document.supplier_name_raw ?? "מסמך ללא ספק",
      [document.doc_type && DOCUMENT_TYPE_LABELS[document.doc_type], document.doc_number].filter(Boolean).join(" "),
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl sm:text-4xl">ייצוא והיסטוריה</h1>
        <p className="mt-1 max-w-prose text-sm text-muted">
          קובץ מסונכרן רק אחרי שסימנתם שהקופה קלטה אותו.
        </p>
      </div>

      {withoutFile.length > 0 && (
        <section className="card">
          <h2 className="font-semibold">קליטות שעוד לא הוכן להן קובץ ({withoutFile.length})</h2>
          <p className="mt-1 text-sm text-muted">הסחורה כבר במלאי כאן, אבל הקופה עוד לא יודעת עליה.</p>
          <ul className="mt-2 divide-y divide-line">
            {withoutFile.map((document) => (
              <li key={document.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <span className="min-w-0 flex-1 basis-56">
                  <span className="block truncate font-medium">{describe(document)}</span>
                  {document.approved_at && (
                    <span className="block text-sm text-muted">אושר ב-{date.format(new Date(document.approved_at))}</span>
                  )}
                </span>
                <Link href={`/receiving/${document.id}/export`} className="btn-quiet">
                  הכנת קובץ
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">קבצים לקופה</h2>
          <nav aria-label="סינון לפי סטטוס" className="flex flex-wrap gap-1 text-sm">
            {FILTERS.map((item) => (
              <Link
                key={item.value}
                href={item.value === "all" ? "/exports" : `/exports?status=${item.value}`}
                aria-current={filter === item.value ? "page" : undefined}
                className={`flex min-h-11 items-center rounded-lg px-3 ${
                  filter === item.value ? "bg-accent-soft font-semibold text-accent-strong" : "hover:bg-canvas"
                }`}
              >
                {item.label} <span className="ms-1 tabular-nums text-muted">{counts[item.value]}</span>
              </Link>
            ))}
          </nav>
        </div>

        {shown.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            {exports.length === 0
              ? "עוד לא הוכן קובץ לקופה. קובץ מכינים מתוך קליטה שאושרה."
              : "אין קבצים בסטטוס הזה."}
          </p>
        ) : (
          <ul className="mt-1 divide-y divide-line">
            {shown.map((item) => (
              <ExportItem
                key={item.id}
                item={item}
                title={
                  <Link href={`/receiving/${item.document_id}/export`} className="underline-offset-4 hover:underline">
                    {describe(item.documents)}
                  </Link>
                }
              />
            ))}
          </ul>
        )}
        {exports.length === LIMIT && (
          <p className="mt-3 border-t border-line pt-3 text-sm text-muted">מוצגים {LIMIT} הקבצים האחרונים.</p>
        )}
      </section>
    </div>
  );
}
