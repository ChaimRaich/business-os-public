import type { Metadata } from "next";
import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can, ROLE_LABELS, ROLES } from "@/lib/permissions";
import { ActionForm } from "@/components/action-form";
import {
  addMember,
  addWarehouse,
  changeMemberRole,
  removeMember,
  renameBusiness,
  renameWarehouse,
  setDefaultWarehouse,
} from "../actions";

export const metadata: Metadata = { title: "הגדרות" };

export default async function SettingsPage() {
  const { user, active } = await requireBusiness();
  const canEdit = can(active.role, "business.edit");
  const canManage = can(active.role, "members.manage");

  const supabase = await createClient();
  const { data: members, error } = await supabase
    .from("business_members")
    .select("user_id, role, profiles (email, full_name)")
    .eq("business_id", active.businessId)
    .order("created_at");
  if (error) {
    throw new Error(`Failed to load members: ${error.message}`);
  }

  const canManageWarehouses = can(active.role, "warehouses.manage");
  const { data: warehouses, error: warehousesError } = await supabase
    .from("warehouses")
    .select("id, name, is_default")
    .eq("business_id", active.businessId)
    .order("created_at");
  if (warehousesError) {
    throw new Error(`Failed to load warehouses: ${warehousesError.message}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">הגדרות</h1>

      <section className="card">
        <h2 className="mb-4 font-semibold">פרטי העסק</h2>
        {canEdit ? (
          <ActionForm
            action={renameBusiness}
            submitLabel="שמירה"
            className="flex flex-wrap items-end gap-3"
          >
            <div className="min-w-0 flex-1 basis-60">
              <label className="label" htmlFor="name">שם העסק</label>
              <input className="field" id="name" name="name" defaultValue={active.businessName} maxLength={120} required />
            </div>
          </ActionForm>
        ) : (
          <p className="text-sm">
            <span className="text-muted">שם העסק: </span>
            {active.businessName}
          </p>
        )}
        <p className="mt-4 text-sm text-muted">
          מנהלים יותר מעסק אחד?{" "}
          <Link href="/new-business" className="font-medium text-accent underline-offset-4 hover:underline">
            פתיחת עסק נוסף
          </Link>
        </p>
      </section>

      <section className="card">
        <h2 className="font-semibold">מחסנים</h2>
        <p className="mt-1 mb-2 text-sm text-muted">
          סחורה נקלטת למחסן ברירת המחדל, אלא אם בוחרים אחר בזמן הקליטה.
        </p>
        <ul className="divide-y divide-line">
          {warehouses.map((warehouse) => (
            <li key={warehouse.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
              {canManageWarehouses ? (
                <ActionForm
                  action={renameWarehouse}
                  submitLabel="שינוי שם"
                  submitClassName="btn-quiet"
                  className="flex min-w-0 flex-1 basis-64 flex-wrap items-center gap-2"
                >
                  <input type="hidden" name="warehouse_id" value={warehouse.id} />
                  <label className="sr-only" htmlFor={`warehouse-${warehouse.id}`}>שם המחסן</label>
                  <input className="field min-w-0 flex-1 basis-36 py-2" id={`warehouse-${warehouse.id}`} name="name" defaultValue={warehouse.name} maxLength={80} required />
                </ActionForm>
              ) : (
                <span className="min-w-0 flex-1 font-medium">{warehouse.name}</span>
              )}
              {warehouse.is_default ? (
                <span className="rounded-full bg-accent-soft px-3 py-1 text-sm text-accent-strong">
                  ברירת מחדל
                </span>
              ) : (
                canManageWarehouses && (
                  <ActionForm
                    action={setDefaultWarehouse}
                    submitLabel="הפיכה לברירת מחדל"
                    submitClassName="min-h-11 px-2 text-sm text-accent underline-offset-4 hover:underline"
                  >
                    <input type="hidden" name="warehouse_id" value={warehouse.id} />
                  </ActionForm>
                )
              )}
            </li>
          ))}
        </ul>
        {canManageWarehouses && (
          <ActionForm
            action={addWarehouse}
            submitLabel="הוספת מחסן"
            submitClassName="btn-quiet"
            className="mt-2 flex flex-wrap items-end gap-3 border-t border-line pt-4"
          >
            <div className="min-w-0 flex-1 basis-48">
              <label className="label" htmlFor="new-warehouse">מחסן או סניף נוסף</label>
              <input className="field" id="new-warehouse" name="name" maxLength={80} required />
            </div>
          </ActionForm>
        )}
      </section>

      <section className="card">
        <h2 className="mb-4 font-semibold">משתמשים והרשאות</h2>
        <ul className="divide-y divide-line">
          {members.map((member) => {
            const isSelf = member.user_id === user.id;
            return (
              <li key={member.user_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate font-medium">
                    {member.profiles.full_name ?? member.profiles.email}
                    {isSelf && <span className="text-muted"> (אתם)</span>}
                  </p>
                  <p className="truncate text-right text-sm text-muted" dir="ltr">
                    {member.profiles.email}
                  </p>
                </div>
                {canManage ? (
                  <>
                    <ActionForm
                      action={changeMemberRole}
                      submitLabel="עדכון"
                      submitClassName="btn-quiet"
                      className="flex flex-wrap items-center gap-2"
                    >
                      <input type="hidden" name="user_id" value={member.user_id} />
                      <label className="sr-only" htmlFor={`role-${member.user_id}`}>
                        תפקיד
                      </label>
                      <select
                        className="field min-h-11 w-auto py-2 text-sm"
                        id={`role-${member.user_id}`}
                        name="role"
                        defaultValue={member.role}
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                    </ActionForm>
                    <ActionForm
                      action={removeMember}
                      submitLabel="הסרה"
                      submitClassName="btn-quiet text-danger"
                      className="flex flex-wrap items-center gap-2"
                    >
                      <input type="hidden" name="user_id" value={member.user_id} />
                    </ActionForm>
                  </>
                ) : (
                  <span className="rounded-full bg-accent-soft px-3 py-1 text-sm text-accent-strong">
                    {ROLE_LABELS[member.role]}
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {canManage && (
          <div className="mt-6 border-t border-line pt-5">
            <h3 className="mb-3 text-sm font-semibold">הוספת משתמש</h3>
            <ActionForm
              action={addMember}
              submitLabel="הוספה"
              className="flex flex-wrap items-end gap-3"
            >
              <div className="min-w-0 flex-1 basis-60">
                <label className="label" htmlFor="member-email">אימייל של משתמש רשום</label>
                <input className="field" id="member-email" name="email" type="email" dir="ltr" required />
              </div>
              <div>
                <label className="label" htmlFor="member-role">תפקיד</label>
                <select className="field min-h-11 w-auto" id="member-role" name="role" defaultValue="staff">
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </div>
            </ActionForm>
            <p className="mt-3 text-xs text-muted">
              המשתמש צריך להירשם לאתר לפני שאפשר לצרף אותו לעסק.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
