import type { ReactNode } from "react";
import { ActionForm } from "@/components/action-form";
import { exportState, TILL_STATE_LABELS, TILL_STATE_STYLES } from "@/lib/documents";
import { confirmPosExport, reportPosExportProblem } from "@/app/(app)/receiving/actions";

export type ExportItemData = {
  id: string;
  document_id: string;
  row_count: number;
  created_at: string;
  confirmed_at: string | null;
  problem_at: string | null;
  problem_note: string | null;
};

const when = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" });

/** One till file: what it is, what happened to it, and what the user can do next. */
export function ExportItem({ item, title }: { item: ExportItemData; title?: ReactNode }) {
  const state = exportState(item);
  return (
    <li className="flex flex-col gap-3 py-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-56 text-sm">
          {title && <span className="block truncate text-base font-medium">{title}</span>}
          <span className="block text-muted">
            {item.row_count} שורות · הוכן ב-{when.format(new Date(item.created_at))}
          </span>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm ${TILL_STATE_STYLES[state]}`}>
          {TILL_STATE_LABELS[state]}
        </span>
        <a href={`/receiving/${item.document_id}/export/${item.id}`} className="btn-quiet" download>
          הורדה
        </a>
      </div>

      {item.confirmed_at && (
        <p className="text-sm text-muted">סומן כנקלט ב-{when.format(new Date(item.confirmed_at))}.</p>
      )}
      {item.problem_at && (
        <p className={`text-sm ${state === "problem" ? "text-danger" : "text-muted"}`}>
          {state === "problem" ? "תקלה" : "תקלה קודמת"} ({when.format(new Date(item.problem_at))}): {item.problem_note}
        </p>
      )}

      {state !== "confirmed" && (
        <div className="flex flex-wrap items-start gap-3">
          <ActionForm action={confirmPosExport} submitLabel="הקובץ נקלט בקופה" submitClassName="btn-quiet">
            <input type="hidden" name="export_id" value={item.id} />
            <input type="hidden" name="document_id" value={item.document_id} />
          </ActionForm>
          <details className="min-w-0 flex-1 basis-64">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm text-muted underline-offset-4 hover:underline">
              {state === "problem" ? "עדכון התקלה" : "הקופה לא קיבלה את הקובץ"}
            </summary>
            <ActionForm
              action={reportPosExportProblem}
              submitLabel="שמירת התקלה"
              submitClassName="btn-quiet"
              className="mt-2 flex flex-wrap items-start gap-2"
            >
              <input type="hidden" name="export_id" value={item.id} />
              <input type="hidden" name="document_id" value={item.document_id} />
              <label className="sr-only" htmlFor={`problem-${item.id}`}>מה הקופה הציגה</label>
              <input
                className="field min-w-0 flex-1 basis-56"
                id={`problem-${item.id}`}
                name="note"
                maxLength={500}
                required
                defaultValue={state === "problem" ? (item.problem_note ?? "") : ""}
                placeholder="מה הקופה הציגה? למשל: שגיאה בשורה 4"
              />
            </ActionForm>
          </details>
        </div>
      )}
    </li>
  );
}
