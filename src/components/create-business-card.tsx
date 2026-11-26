import type { ReactNode } from "react";
import { ActionForm } from "@/components/action-form";
import { createBusiness } from "@/app/(app)/actions";

export function CreateBusinessCard({ footer }: { footer?: ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center text-sm font-semibold tracking-[0.2em] text-accent">
          BUSINESS OS
        </p>
        <div className="card">
          <h1 className="text-xl font-bold">פתיחת עסק</h1>
          <p className="mt-2 mb-5 text-sm leading-relaxed text-muted">
            כל הנתונים — מוצרים, מלאי ומסמכים — נשמרים תחת העסק ונראים רק למשתמשים שתצרפו אליו.
          </p>
          <ActionForm action={createBusiness} submitLabel="יצירת העסק" className="flex flex-col gap-4">
            <div>
              <label className="label" htmlFor="name">שם העסק</label>
              <input className="field" id="name" name="name" maxLength={120} required />
            </div>
          </ActionForm>
        </div>
        {footer && <div className="mt-4 text-center text-sm text-muted">{footer}</div>}
      </div>
    </main>
  );
}
