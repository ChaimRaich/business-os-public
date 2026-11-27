import type { Metadata } from "next";
import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { exportState } from "@/lib/documents";
import { isOlderThanDays } from "@/lib/sales";
import { can } from "@/lib/permissions";
import { ActionForm } from "@/components/action-form";
import { connectWebStore, disconnectWebStore, syncWebStore } from "./actions";

export const metadata: Metadata = { title: "חיבורים" };

/** Without a newer sales report than this, stock is shown as out of date. */
const STALE_AFTER_DAYS = 7;

type Tone = "ok" | "wait" | "bad" | "off";
const TONES: Record<Tone, string> = {
  ok: "bg-accent-soft text-accent-strong",
  wait: "bg-warn-soft text-warn",
  bad: "bg-danger-soft text-danger",
  off: "bg-canvas text-muted",
};

export default async function ConnectionsPage() {
  const { active } = await requireBusiness();
  const supabase = await createClient();
  const canManage = can(active.role, "warehouses.manage");
  const [exportsResult, approvedResult, importsResult, unmatchedResult, webResult, warehousesResult] = await Promise.all([
    supabase
      .from("pos_exports")
      .select("created_at, confirmed_at, problem_at")
      .eq("business_id", active.businessId)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("documents")
      .select("id, pos_exports (id)")
      .eq("business_id", active.businessId)
      .eq("status", "approved")
      .limit(500),
    supabase
      .from("sales_imports")
      .select("created_at, last_sold_at")
      .eq("business_id", active.businessId)
      .eq("source", "pos_file")
      .is("reverted_at", null)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("sales_lines")
      .select("id", { count: "exact", head: true })
      .eq("business_id", active.businessId)
      .is("applied_at", null),
    supabase
      .from("web_connections")
      .select("store_url, sync_from, key_hint, synced_until, last_attempt_at, last_ok_at, last_orders, last_error, last_error_at, warehouses (name)")
      .eq("business_id", active.businessId)
      .maybeSingle(),
    supabase.from("warehouses").select("id, name, is_default").eq("business_id", active.businessId).order("created_at"),
  ]);
  const web = webResult.data;
  const warehouses = warehousesResult.data ?? [];
  const failed = exportsResult.error ?? approvedResult.error ?? importsResult.error ?? unmatchedResult.error;
  if (failed) {
    throw new Error(`Failed to load connections: ${failed.message}`);
  }
  const exports = exportsResult.data ?? [];
  const when = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" });
  const format = (value: string | null | undefined) => (value ? when.format(new Date(value)) : "עוד לא");

  // Till, outgoing: stock files.
  const pending = exports.filter((item) => exportState(item) === "pending").length;
  const problems = exports.filter((item) => exportState(item) === "problem").length;
  const withoutFile = (approvedResult.data ?? []).filter((document) => document.pos_exports.length === 0).length;
  const lastConfirmed = exports.map((item) => item.confirmed_at).filter((v): v is string => v !== null).sort().at(-1);
  const outgoing: { tone: Tone; status: string } =
    problems > 0
      ? { tone: "bad", status: "תקלה" }
      : pending + withoutFile > 0
        ? { tone: "wait", status: "יש פעולות ממתינות" }
        : exports.length > 0
          ? { tone: "ok", status: "מעודכן" }
          : { tone: "off", status: "עוד לא נשלח קובץ" };

  // Till, incoming: sales reports.
  const lastImport = importsResult.data?.[0];
  const unmatched = unmatchedResult.count ?? 0;
  const stale = lastImport ? isOlderThanDays(lastImport.created_at, STALE_AFTER_DAYS) : false;
  const incoming: { tone: Tone; status: string } = !lastImport
    ? { tone: "off", status: "עוד לא יובא דוח" }
    : unmatched > 0
      ? { tone: "bad", status: "יש מכירות שלא זוהו" }
      : stale
        ? { tone: "wait", status: "לא מעודכן" }
        : { tone: "ok", status: "מעודכן" };

  // Web store, incoming: orders.
  const site: { tone: Tone; status: string } = !web
    ? { tone: "off", status: "לא מחובר" }
    : web.last_error
      ? { tone: "bad", status: "הסנכרון נכשל" }
      : !web.last_ok_at
        ? { tone: "wait", status: "מחובר, עוד לא סונכרן" }
        : isOlderThanDays(web.last_ok_at, 1)
          ? { tone: "wait", status: "לא מעודכן" }
          : { tone: "ok", status: "מעודכן" };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/settings" className="text-sm text-muted underline-offset-4 hover:underline">
          → הגדרות
        </Link>
        <h1 className="mt-1 text-3xl sm:text-4xl">חיבורים</h1>
      </div>

      {(!lastImport || stale) && (
        <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn" role="status">
          {lastImport
            ? `דוח המכירות האחרון יובא לפני יותר מ-${STALE_AFTER_DAYS} ימים. `
            : "עוד לא יובא דוח מכירות מהקופה. "}
          המלאי המוצג לא כולל את מה שנמכר מאז.
        </p>
      )}

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">קופה · קובצי מלאי (מהמערכת לקופה)</h2>
          <span className={`rounded-full px-3 py-1 text-sm ${TONES[outgoing.tone]}`}>{outgoing.status}</span>
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div><dt className="inline text-muted">קובץ אחרון שנקלט בקופה: </dt><dd className="inline">{format(lastConfirmed)}</dd></div>
          <div><dt className="inline text-muted">קבצים שממתינים להעלאה: </dt><dd className="inline tabular-nums">{pending}</dd></div>
          <div><dt className="inline text-muted">קבצים שהקופה לא קיבלה: </dt><dd className={`inline tabular-nums ${problems > 0 ? "font-semibold text-danger" : ""}`}>{problems}</dd></div>
          <div><dt className="inline text-muted">קליטות שעוד לא הוכן להן קובץ: </dt><dd className="inline tabular-nums">{withoutFile}</dd></div>
        </dl>
        <Link href={problems > 0 ? "/exports?status=problem" : "/exports"} className="btn-quiet mt-4">
          ייצוא והיסטוריה
        </Link>
      </section>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">קופה · דוחות מכירות (מהקופה למערכת)</h2>
          <span className={`rounded-full px-3 py-1 text-sm ${TONES[incoming.tone]}`}>{incoming.status}</span>
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div><dt className="inline text-muted">ייבוא אחרון: </dt><dd className="inline">{format(lastImport?.created_at)}</dd></div>
          <div><dt className="inline text-muted">המכירה המאוחרת ביותר בדוח: </dt><dd className="inline">{lastImport?.last_sold_at ? format(lastImport.last_sold_at) : "לא ידוע"}</dd></div>
          <div><dt className="inline text-muted">שורות מכירה שלא זוהו בקטלוג: </dt><dd className={`inline tabular-nums ${unmatched > 0 ? "font-semibold text-danger" : ""}`}>{unmatched}</dd></div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/sales/import" className="btn-quiet">ייבוא דוח מכירות</Link>
          <Link href="/sales" className="btn-quiet">כל המכירות</Link>
        </div>
      </section>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">אתר המסחר · WooCommerce (מהאתר למערכת)</h2>
          <span className={`rounded-full px-3 py-1 text-sm ${TONES[site.tone]}`}>{site.status}</span>
        </div>
        <p className="mt-1 max-w-prose text-sm text-muted">
          הזמנות מהאתר יורדות מהמלאי כאן. החיבור קורא בלבד: המלאי שבאתר לא מתעדכן.
        </p>

        {web ? (
          <>
            <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div><dt className="inline text-muted">האתר: </dt><dd className="inline"><bdi dir="ltr">{web.store_url.replace(/^https?:\/\//, "")}</bdi></dd></div>
              <div><dt className="inline text-muted">מפתח שמסתיים ב: </dt><dd className="inline"><bdi dir="ltr" className="font-mono">…{web.key_hint}</bdi></dd></div>
              <div><dt className="inline text-muted">יורד מהמחסן: </dt><dd className="inline">{web.warehouses.name}</dd></div>
              <div><dt className="inline text-muted">הזמנות נספרות החל מ: </dt><dd className="inline">{format(web.sync_from)}</dd></div>
              <div><dt className="inline text-muted">סנכרון אחרון שהצליח: </dt><dd className="inline">{format(web.last_ok_at)}</dd></div>
              <div><dt className="inline text-muted">הזמנות שנקראו בו: </dt><dd className="inline tabular-nums">{web.last_orders ?? "—"}</dd></div>
            </dl>
            {web.last_error && (
              <p className="mt-3 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
                הסנכרון האחרון נכשל ({format(web.last_error_at)}): {web.last_error}
              </p>
            )}
            {canManage ? (
              <div className="mt-4 flex flex-wrap items-start gap-3">
                <ActionForm action={syncWebStore} submitLabel="סנכרון עכשיו" pendingLabel="קורא הזמנות מהאתר…" className="flex flex-wrap items-center gap-3" />
                <details className="min-w-0 flex-1 basis-64 text-sm">
                  <summary className="flex min-h-11 cursor-pointer items-center text-muted underline-offset-4 hover:underline">
                    ניתוק האתר
                  </summary>
                  <p className="mb-2 max-w-prose text-muted">
                    המפתח יימחק מכאן. מחקו אותו גם ב-WooCommerce.
                  </p>
                  <ActionForm action={disconnectWebStore} submitLabel="ניתוק ומחיקת המפתח" pendingLabel="מנתק…" submitClassName="btn-quiet text-danger" />
                </details>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">סנכרון וניתוק: בעלים או מנהל.</p>
            )}
            <p className="mt-3 border-t border-line pt-3 text-sm text-muted">
              הסנכרון ידני. פריט מזוהה לפי המק״ט (SKU) באתר: זהה לברקוד בקופה, או רשום במוצר כ״מזהה באתר״.
            </p>
          </>
        ) : canManage ? (
          <>
            <details className="mt-3 text-sm">
              <summary className="flex min-h-11 cursor-pointer items-center text-muted underline-offset-4 hover:underline">
                איך מוציאים מפתח?
              </summary>
              <ol className="flex list-decimal flex-col gap-1 ps-5">
                <li>בניהול האתר: WooCommerce ← הגדרות ← מתקדם ← REST API ← ״הוספת מפתח״.</li>
                <li>הרשאות: <strong>קריאה</strong> בלבד.</li>
                <li>מעתיקים לכאן את מפתח הלקוח (ck_) ואת סוד הלקוח (cs_). הסוד מוצג פעם אחת.</li>
              </ol>
            </details>
            <p className="mt-3 rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">
              אם הזמנות האתר מוקלדות גם בקופה, אל תחברו את האתר: הן ירדו מהמלאי פעמיים.
            </p>
            <ActionForm action={connectWebStore} submitLabel="בדיקה וחיבור" pendingLabel="בודק את החיבור…" className="mt-4 flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="store_url">כתובת האתר</label>
                  <input className="field" id="store_url" name="store_url" type="url" dir="ltr" placeholder="https://example.co.il" autoComplete="off" required />
                </div>
                <div>
                  <label className="label" htmlFor="consumer_key">מפתח לקוח (Consumer key)</label>
                  <input className="field font-mono" id="consumer_key" name="consumer_key" dir="ltr" autoComplete="off" spellCheck={false} required />
                </div>
                <div>
                  <label className="label" htmlFor="consumer_secret">סוד לקוח (Consumer secret)</label>
                  <input className="field font-mono" id="consumer_secret" name="consumer_secret" type="password" dir="ltr" autoComplete="off" required />
                </div>
                <div>
                  <label className="label" htmlFor="web_warehouse">המחסן שממנו נשלחות הזמנות האתר</label>
                  <select className="field min-h-11" id="web_warehouse" name="warehouse_id" defaultValue={(warehouses.find((w) => w.is_default) ?? warehouses[0])?.id}>
                    {warehouses.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="sync_from">לספור הזמנות החל מתאריך</label>
                  <input className="field" id="sync_from" name="sync_from" type="date" required aria-describedby="sync-from-hint" />
                  <p id="sync-from-hint" className="mt-1 text-xs text-muted">
                    היום שממנו המלאי כאן נכון.
                  </p>
                </div>
              </div>
            </ActionForm>
          </>
        ) : (
          <p className="mt-3 text-sm text-muted">האתר עוד לא חובר. חיבור האתר: בעלים או מנהל.</p>
        )}
      </section>
    </div>
  );
}
