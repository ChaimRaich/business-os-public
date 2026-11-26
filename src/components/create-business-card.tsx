import type { ReactNode } from "react";
import { Building2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { createBusiness } from "@/app/(app)/actions";

export function CreateBusinessCard({ footer }: { footer?: ReactNode }) {
  return (
    <main className="relative flex flex-1 items-center justify-center px-4 py-12">
      <div className="absolute end-4 top-4 sm:end-6 sm:top-6">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <BrandMark />
        </div>
        <div className="card p-6 sm:p-8">
          <div className="mb-4 inline-flex size-11 items-center justify-center rounded-2xl bg-accent-soft text-accent-strong">
            <Building2 className="size-5" aria-hidden />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">פתיחת עסק</h1>
          <p className="mt-2 mb-6 text-sm leading-relaxed text-muted">
            כל הנתונים — מוצרים, מלאי ומסמכים — נשמרים תחת העסק ונראים רק למשתמשים שתצרפו אליו.
          </p>
          <ActionForm action={createBusiness} submitLabel="יצירת העסק" submitClassName="btn w-full" className="flex flex-col gap-4">
            <div>
              <label className="label" htmlFor="name">שם העסק</label>
              <input className="field" id="name" name="name" maxLength={120} placeholder="למשל: תכשיטי הגליל" required />
            </div>
          </ActionForm>
        </div>
        {footer && <div className="mt-4 text-center text-sm text-muted">{footer}</div>}
      </div>
    </main>
  );
}
