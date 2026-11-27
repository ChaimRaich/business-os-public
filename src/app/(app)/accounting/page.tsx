import type { Metadata } from "next";
import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { formatAmount } from "@/lib/documents";
import { ActionForm } from "@/components/action-form";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  formatDay,
  inPeriod,
  loadAccounting,
  openPayables,
  parsePeriod,
  periodOptions,
  purchaseTitle,
  summarize,
  todayInIsrael,
  vatNote,
} from "@/lib/accounting";
import { createExpense, deleteExpense, setDocumentPayment, setExpensePayment } from "./actions";

export const metadata: Metadata = { title: "ראיית חשבון" };

const money = (value: number) => `${formatAmount(value)} ₪`;

function PaymentControl({
  action,
  id,
  label,
  dueDate,
  paidAt,
  today,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  label: string;
  dueDate: string | null;
  paidAt: string | null;
  today: string;
}) {
  if (paidAt) {
    return (
      <form action={action} className="flex items-center gap-2 text-sm">
        <input type="hidden" name="id" value={id} />
        <span className="rounded-full bg-accent-soft px-2.5 py-1 text-accent-strong">שולם {formatDay(paidAt)}</span>
        <button type="submit" name="intent" value="unpaid" className="min-h-11 px-1 text-muted underline underline-offset-4 hover:text-ink">
          ביטול
        </button>
      </form>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="id" value={id} />
      {dueDate && dueDate < today && <span className="rounded-full bg-danger-soft px-2.5 py-1 text-danger">באיחור</span>}
      <label className="flex items-center gap-2 text-muted">
        לתשלום עד
        <input type="date" name="due_date" defaultValue={dueDate ?? ""} aria-label={`מועד תשלום: ${label}`} className="field w-auto py-1.5 text-sm" />
      </label>
      <button type="submit" name="intent" value="due" className="btn-quiet">
        שמירה
      </button>
      <button type="submit" name="intent" value="paid" className="btn">
        שולם
      </button>
    </form>
  );
}

function Amounts({ net, vat, total }: { net: number; vat: number | null; total: number }) {
  return (
    <span className="text-sm text-muted">
      <bdi dir="ltr">{money(net)}</bdi> + מע״מ {vat === null ? "לא ידוע" : <bdi dir="ltr">{money(vat)}</bdi>} ={" "}
      <bdi dir="ltr" className="font-semibold text-ink">{money(total)}</bdi>
    </span>
  );
}

export default async function AccountingPage({ searchParams }: PageProps<"/accounting">) {
  const { active } = await requireBusiness();
  if (!can(active.role, "accounting.view")) {
    return (
      <div className="card">
        <h1 className="text-3xl sm:text-4xl">ראיית חשבון</h1>
        <p className="mt-2 text-sm text-muted">המסך הזה פתוח לבעלים ולמנהלים בלבד.</p>
      </div>
    );
  }
  const requested = (await searchParams).period;
  const today = todayInIsrael();
  const period = parsePeriod(typeof requested === "string" ? requested : undefined, today);
  const options = periodOptions(today);
  const all = await loadAccounting(await createClient(), active.businessId);
  const purchases = all.purchases.filter((item) => inPeriod(item.date, period));
  const expenses = all.expenses.filter((item) => inPeriod(item.date, period));
  const totals = summarize(purchases, expenses);
  const open = openPayables(all.purchases, all.expenses, today);

  const tiles = [
    { label: "קניות סחורה", value: money(totals.purchasesNet), hint: "לפני מע״מ" },
    { label: "הוצאות אחרות", value: money(totals.expensesNet), hint: "לפני מע״מ" },
    { label: "מע״מ תשומות", value: money(totals.inputVat), hint: "מע״מ ששולם על קניות והוצאות בתקופה" },
    {
      label: "פתוח לתשלום",
      value: money(open.total),
      hint: `${open.count} מסמכים, בכל התקופות${open.overdue > 0 ? ` · ${open.overdue} באיחור` : ""}`,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl sm:text-4xl">ראיית חשבון</h1>
          <p className="mt-1 text-sm text-muted">
            {period.label} · {formatDay(period.from)} עד {formatDay(period.to)}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <form action="/accounting" method="get" className="flex items-end gap-2">
            <label className="text-sm">
              <span className="label">תקופה</span>
              <select name="period" defaultValue={period.key} className="field py-2">
                <optgroup label="דו־חודשי">
                  {options.double.map((item) => (
                    <option key={item.key} value={item.key}>{item.label}</option>
                  ))}
                </optgroup>
                <optgroup label="חודשי">
                  {options.single.map((item) => (
                    <option key={item.key} value={item.key}>{item.label}</option>
                  ))}
                </optgroup>
              </select>
            </label>
            <button type="submit" className="btn-quiet">הצגה</button>
          </form>
          <a href={`/accounting/export?period=${period.key}`} className="btn">
            קובץ לרואה החשבון
          </a>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="card">
            <span className="block text-sm text-muted">{tile.label}</span>
            <bdi dir="ltr" className="display mt-2 block text-3xl tabular-nums">{tile.value}</bdi>
            <span className="mt-1 block text-xs text-muted">{tile.hint}</span>
          </div>
        ))}
      </div>

      <p className="max-w-prose text-sm text-muted">
        הוצאות בלבד. את דוח ההכנסות מעבירים לרואה החשבון מהקופה.
        {totals.vatUnknown > 0 && ` ב-${totals.vatUnknown} מסמכים בתקופה המע״מ לא מופיע, ולכן הוא לא נכלל בסכום.`}
      </p>

      <section className="card">
        <h2 className="font-semibold">מסמכי ספקים בתקופה ({purchases.length})</h2>
        {purchases.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            אין קליטות מאושרות בתקופה.
          </p>
        ) : (
          <ul className="mt-1 divide-y divide-line">
            {purchases.map((item) => (
              <li key={item.documentId} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <span className="min-w-0 flex-1 basis-64">
                  <Link href={`/receiving/${item.documentId}`} className="block truncate font-medium hover:text-accent">
                    <bdi>{item.supplierName ?? "ללא ספק"}</bdi> · <bdi>{purchaseTitle(item)}</bdi>
                  </Link>
                  <span className="block text-sm text-muted">
                    {formatDay(item.date)}
                    {vatNote(item) && ` · ${vatNote(item)}`}
                    {item.linesWithoutCost > 0 && ` · ${item.linesWithoutCost} שורות בלי עלות`}
                  </span>
                  <Amounts net={item.net} vat={item.vat} total={item.total} />
                </span>
                <PaymentControl action={setDocumentPayment} id={item.documentId} label={purchaseTitle(item)} dueDate={item.dueDate} paidAt={item.paidAt} today={today} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="font-semibold">הוצאות אחרות בתקופה ({expenses.length})</h2>
        {expenses.length === 0 ? (
          <p className="mt-2 text-sm text-muted">אין הוצאות בתקופה.</p>
        ) : (
          <ul className="mt-1 divide-y divide-line">
            {expenses.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <span className="min-w-0 flex-1 basis-64">
                  <span className="block truncate font-medium">
                    <bdi>{item.vendor}</bdi> · {EXPENSE_CATEGORY_LABELS[item.category]}
                  </span>
                  <span className="block text-sm text-muted">
                    {formatDay(item.date)}
                    {item.docNumber && <> · מסמך <bdi dir="ltr">{item.docNumber}</bdi></>}
                    {item.description && <> · <bdi>{item.description}</bdi></>}
                  </span>
                  <Amounts net={item.net} vat={item.vat} total={item.total} />
                </span>
                <PaymentControl action={setExpensePayment} id={item.id} label={item.vendor} dueDate={item.dueDate} paidAt={item.paidAt} today={today} />
                <form action={deleteExpense}>
                  <input type="hidden" name="id" value={item.id} />
                  <button type="submit" aria-label={`מחיקת ההוצאה ל${item.vendor}`} className="min-h-11 px-1 text-sm text-danger underline underline-offset-4">
                    מחיקה
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="mb-4 font-semibold">הוצאה חדשה</h2>
        <ActionForm action={createExpense} submitLabel="שמירת ההוצאה" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 [&>button]:justify-self-start">
          <label>
            <span className="label">תאריך המסמך</span>
            <input type="date" name="expense_date" required defaultValue={today} className="field" />
          </label>
          <label>
            <span className="label">למי שולם</span>
            <input name="vendor" required maxLength={120} placeholder="למשל חברת החשמל" className="field" />
          </label>
          <label>
            <span className="label">סוג ההוצאה</span>
            <select name="category" defaultValue="other" className="field">
              {EXPENSE_CATEGORIES.map((category) => (
                <option key={category} value={category}>{EXPENSE_CATEGORY_LABELS[category]}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">סכום לפני מע״מ</span>
            <input name="amount_net" required inputMode="decimal" dir="ltr" className="field text-end" />
          </label>
          <label>
            <span className="label">מע״מ (ריק אם אין)</span>
            <input name="vat_amount" inputMode="decimal" dir="ltr" className="field text-end" />
          </label>
          <label>
            <span className="label">מספר חשבונית</span>
            <input name="doc_number" maxLength={40} dir="ltr" className="field text-end" />
          </label>
          <label className="sm:col-span-2">
            <span className="label">תיאור</span>
            <input name="description" maxLength={300} className="field" />
          </label>
          <label>
            <span className="label">לתשלום עד</span>
            <input type="date" name="due_date" className="field" />
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2 lg:col-span-3">
            <input type="checkbox" name="paid" className="size-5 accent-accent" />
            כבר שולם
          </label>
        </ActionForm>
      </section>
    </div>
  );
}
