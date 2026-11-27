import type { ReactNode } from "react";
import { ActionForm } from "@/components/action-form";
import { EntryScreen } from "@/components/brand";
import { createBusiness } from "@/app/(app)/actions";

export function CreateBusinessCard({ footer }: { footer?: ReactNode }) {
  return (
    <EntryScreen
      badge="צעד אחרון לפני שמתחילים"
      title="פותחים את העסק."
      lede="כל הנתונים — מוצרים, מלאי ומסמכים — נשמרים תחת העסק ונראים רק למשתמשים שתצרפו אליו."
      footer={footer}
    >
      <h1 className="mb-5 text-xl font-bold">פתיחת עסק</h1>
      <ActionForm action={createBusiness} submitLabel="יצירת העסק" className="flex flex-col gap-4">
        <div>
          <label className="label" htmlFor="name">שם העסק</label>
          <input className="field" id="name" name="name" maxLength={120} required />
        </div>
      </ActionForm>
    </EntryScreen>
  );
}
