import type { Metadata } from "next";
import { requireBusiness } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { WorkersChats } from "@/components/assistant-chat";

export const metadata: Metadata = { title: "עובדים" };

/** Every chat of the business as a worker: the main one runs the whole business, the others one area each. */
export default async function WorkersPage() {
  const { user, active } = await requireBusiness();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl sm:text-4xl">עובדים</h1>
        <p className="mt-2 text-muted">כל עובד מכיר את התחום שלו מתוך נתוני העסק. מנהל העבודה מכיר את הכול.</p>
      </div>
      <WorkersChats
        key={active.businessId}
        businessName={active.businessName}
        businessId={active.businessId}
        userId={user.id}
        canManage={can(active.role, "accounting.view")}
      />
    </div>
  );
}
