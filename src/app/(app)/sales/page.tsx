import type { Metadata } from "next";
import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatAmount } from "@/lib/documents";
import { ActionForm } from "@/components/action-form";
import { can } from "@/lib/permissions";
import { ignoreSalesCode, rematchSales, revertSalesImport, unignoreSalesCode } from "./actions";

export const metadata: Metadata = { title: "מכירות" };

const UNMATCHED_LIMIT = 1000;

export default async function SalesPage() {
  const { active } = await requireBusiness();
  const supabase = await createClient();
  const [{ data: imports, error }, { data: unmatched, error: unmatchedError }, { data: ignored }] = await Promise.all([
    supabase
      .from("sales_imports")
      .select("id, source, file_name, row_count, skipped_count, ignored_count, report_date, first_sold_at, last_sold_at, created_at, reverted_at, warehouses (name)")
      .eq("business_id", active.businessId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("sales_lines")
      .select("id, import_id, code, item_name, quantity")
      .eq("business_id", active.businessId)
      .is("applied_at", null)
      .limit(UNMATCHED_LIMIT),
    supabase
      .from("sales_ignored_codes")
      .select("code, item_name")
      .eq("business_id", active.businessId)
      .order("created_at"),
  ]);
  const canRevert = can(active.role, "catalog.delete");
  if (error || unmatchedError) {
    throw new Error(`Failed to load sales: ${(error ?? unmatchedError)?.message}`);
  }

  const date = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeZone: "Asia/Jerusalem" });
  const when = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" });

  const byCode = new Map<string, { code: string; name: string | null; quantity: number; lines: number }>();
  const unmatchedPerImport = new Map<string, number>();
  for (const line of unmatched) {
    const key = line.code.toUpperCase();
    const entry = byCode.get(key) ?? { code: line.code, name: null, quantity: 0, lines: 0 };
    entry.name ??= line.item_name;
    entry.quantity += line.quantity;
    entry.lines += 1;
    byCode.set(key, entry);
    unmatchedPerImport.set(line.import_id, (unmatchedPerImport.get(line.import_id) ?? 0) + 1);
  }
  const codes = [...byCode.values()].sort((a, b) => b.quantity - a.quantity);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl sm:text-4xl">מכירות</h1>
        <Link href="/sales/import" className="btn">
          ייבוא דוח מכירות
        </Link>
      </div>

      <p className="max-w-prose text-sm text-muted">
        המלאי יורד רק כשמייבאים דוח מכירות מהקופה.{" "}
        <Link href="/settings/connections" className="font-medium text-accent underline underline-offset-4">
          מצב החיבורים
        </Link>
      </p>

      {codes.length > 0 && (
        <section className="card" role="alert">
          <h2 className="font-semibold">מכירות שלא זוהו בקטלוג ({unmatched.length}{unmatched.length === UNMATCHED_LIMIT && "+"} שורות)</h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            המכירות האלה לא ירדו מהמלאי. הוסיפו את הקוד למוצר ולחצו ״ניסיון זיהוי מחדש״, או סמנו ״לא פריט מלאי״.
          </p>
          <ul className="mt-3 divide-y divide-line text-sm">
            {codes.slice(0, 50).map((entry) => (
              <li key={entry.code} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                <span className="min-w-0 flex-1 basis-48">
                  <span className="block truncate">{entry.name ?? "ללא שם בדוח"}</span>
                  <bdi dir="ltr" className="block font-mono text-muted">{entry.code}</bdi>
                </span>
                <span className="text-muted">
                  <bdi dir="ltr">{formatAmount(entry.quantity, 0)}</bdi> יחידות
                  {entry.lines > 1 && ` · ${entry.lines} שורות`}
                </span>
                <Link href={`/products?q=${encodeURIComponent(entry.code)}`} className="flex min-h-11 items-center text-accent underline underline-offset-4">
                  חיפוש בקטלוג
                </Link>
                <ActionForm action={ignoreSalesCode} submitLabel="לא פריט מלאי" submitClassName="btn-quiet">
                  <input type="hidden" name="code" value={entry.code} />
                </ActionForm>
              </li>
            ))}
          </ul>
          {codes.length > 50 && <p className="mt-2 text-sm text-muted">ועוד {codes.length - 50} קודים.</p>}
          <ActionForm action={rematchSales} submitLabel="ניסיון זיהוי מחדש" pendingLabel="בודק…" submitClassName="btn-quiet" className="mt-4 flex flex-wrap items-center gap-3" />
        </section>
      )}

      <section className="card">
        <h2 className="font-semibold">דוחות שיובאו</h2>
        {imports.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            עוד לא יובא דוח מכירות.
          </p>
        ) : (
          <ul className="mt-1 divide-y divide-line">
            {imports.map((item) => {
              const lines = item.row_count - item.skipped_count - item.ignored_count;
              const open = unmatchedPerImport.get(item.id) ?? 0;
              const reverted = item.reverted_at !== null;
              return (
                <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                  <span className="min-w-0 flex-1 basis-56">
                    <span className="block truncate font-medium">
                      <bdi>{item.file_name ?? "דוח מכירות"}</bdi>
                    </span>
                    <span className="block text-sm text-muted">
                      יובא ב-{when.format(new Date(item.created_at))} · {item.warehouses.name}
                      {item.report_date ? (
                        <> · מכירות של {item.report_date.split("-").reverse().join("/")}</>
                      ) : (
                        item.first_sold_at && item.last_sold_at && (
                          <> · מכירות מ-{date.format(new Date(item.first_sold_at))} עד {date.format(new Date(item.last_sold_at))}</>
                        )
                      )}
                    </span>
                  </span>
                  <span className="text-sm text-muted">
                    {lines} שורות
                    {item.skipped_count > 0 && ` · ${item.skipped_count} כבר יובאו בעבר ודולגו`}
                    {item.ignored_count > 0 && ` · ${item.ignored_count} לא פריטי מלאי`}
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-sm ${
                      reverted ? "bg-canvas text-muted" : open > 0 ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent-strong"
                    }`}
                  >
                    {reverted
                      ? `בוטל ב-${date.format(new Date(item.reverted_at ?? item.created_at))}, המלאי הוחזר`
                      : open > 0
                        ? `${open} לא זוהו`
                        : "ירד מהמלאי"}
                  </span>
                  {!reverted && canRevert && item.source === "pos_file" && (
                    <details className="basis-full text-sm">
                      <summary className="flex min-h-11 cursor-pointer items-center text-muted underline-offset-4 hover:underline">
                        ביטול הייבוא
                      </summary>
                      <p className="mb-2 max-w-prose text-muted">
                        המלאי שירד בדוח יוחזר, ואפשר יהיה לייבא דוח מתוקן.
                      </p>
                      <ActionForm action={revertSalesImport} submitLabel="ביטול הייבוא והחזרת המלאי" pendingLabel="מבטל…" submitClassName="btn-quiet text-danger">
                        <input type="hidden" name="id" value={item.id} />
                      </ActionForm>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {(ignored ?? []).length > 0 && (
        <section className="card">
          <h2 className="font-semibold">קודים שאינם פריטי מלאי ({(ignored ?? []).length})</h2>
          <p className="mt-1 text-sm text-muted">שורות עם הקודים האלה מדולגות בכל דוח מכירות.</p>
          <ul className="mt-2 divide-y divide-line text-sm">
            {(ignored ?? []).map((entry) => (
              <li key={entry.code} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                <span className="min-w-0 flex-1 basis-48">
                  {entry.item_name ?? "ללא שם"} <bdi dir="ltr" className="font-mono text-muted">{entry.code}</bdi>
                </span>
                <ActionForm action={unignoreSalesCode} submitLabel="החזרה לרשימה" submitClassName="btn-quiet">
                  <input type="hidden" name="code" value={entry.code} />
                </ActionForm>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
