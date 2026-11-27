"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_BUSINESS_COOKIE, getMemberships, requireBusiness, requireUser } from "@/lib/auth";
import { ROLES, type Role } from "@/lib/permissions";
import { catalogErrorMessage } from "@/lib/catalog";
import type { FormState } from "@/components/action-form";

// Every action re-reads the session and takes the business id from the server-side
// context, never from the form. Postgres RLS is what actually enforces access.

const GENERIC_ERROR = "הפעולה נכשלה. נסו שוב בעוד רגע.";

async function setActiveBusiness(businessId: string) {
  (await cookies()).set(ACTIVE_BUSINESS_COOKIE, businessId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

function parseRole(value: FormDataEntryValue | null): Role | null {
  return ROLES.includes(value as Role) ? (value as Role) : null;
}

export async function createBusiness(_: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { error: "יש להזין שם עסק." };
  }
  if (name.length > 120) {
    return { error: "שם העסק ארוך מדי (עד 120 תווים)." };
  }

  const supabase = await createClient();
  const { data: businessId, error } = await supabase.rpc("create_business", { p_name: name });
  if (error || !businessId) {
    return { error: GENERIC_ERROR };
  }
  await setActiveBusiness(businessId);
  revalidatePath("/", "layout");
  redirect("/");
}

export async function switchBusiness(formData: FormData) {
  const businessId = String(formData.get("business_id") ?? "");
  const memberships = await getMemberships();
  if (memberships.some((m) => m.businessId === businessId)) {
    await setActiveBusiness(businessId);
    revalidatePath("/", "layout");
  }
  redirect("/");
}

export async function renameBusiness(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 120) {
    return { error: "יש להזין שם עסק (עד 120 תווים)." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("businesses")
    .update({ name })
    .eq("id", active.businessId)
    .select("id");
  if (error) {
    return { error: GENERIC_ERROR };
  }
  if (data.length === 0) {
    return { error: "רק בעלי העסק יכולים לשנות את השם." };
  }
  revalidatePath("/", "layout");
  return { ok: "השם עודכן." };
}

/** The shortage threshold for items that have none of their own. Empty clears it. */
export async function setLowStockDefault(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const raw = String(formData.get("low_stock_default") ?? "").trim();
  const value = raw === "" ? null : Number(raw);
  if (value !== null && (!/^\d+(\.\d+)?$/.test(raw) || value > 100000)) {
    return { error: "הסף צריך להיות מספר, 0 ומעלה." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("businesses")
    .update({ low_stock_default: value })
    .eq("id", active.businessId)
    .select("id");
  if (error) {
    return { error: GENERIC_ERROR };
  }
  if (data.length === 0) {
    return { error: "רק בעלי העסק יכולים לשנות את הסף הכללי." };
  }
  revalidatePath("/reports/stock");
  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: value === null ? "הסף הכללי בוטל." : "הסף הכללי נשמר." };
}

export async function addMember(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const email = String(formData.get("email") ?? "").trim();
  const role = parseRole(formData.get("role"));
  if (!email || !role) {
    return { error: "יש להזין אימייל ולבחור תפקיד." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_member_by_email", {
    p_business_id: active.businessId,
    p_email: email,
    p_role: role,
  });
  if (error) {
    if (error.message.includes("user_not_found")) {
      return { error: "לא נמצא משתמש עם האימייל הזה. עליו להירשם לאתר קודם." };
    }
    if (error.message.includes("already_member")) {
      return { error: "המשתמש כבר חבר בעסק." };
    }
    if (error.message.includes("forbidden")) {
      return { error: "רק בעלי העסק יכולים להוסיף משתמשים." };
    }
    return { error: GENERIC_ERROR };
  }
  revalidatePath("/settings");
  return { ok: "המשתמש נוסף." };
}

export async function changeMemberRole(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const userId = String(formData.get("user_id") ?? "");
  const role = parseRole(formData.get("role"));
  if (!userId || !role) {
    return { error: GENERIC_ERROR };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_members")
    .update({ role })
    .eq("business_id", active.businessId)
    .eq("user_id", userId)
    .select("user_id");
  if (error) {
    return {
      error: error.message.includes("last_owner")
        ? "חייב להישאר לעסק לפחות בעלים אחד."
        : GENERIC_ERROR,
    };
  }
  if (data.length === 0) {
    return { error: "רק בעלי העסק יכולים לשנות תפקידים." };
  }
  revalidatePath("/", "layout");
  return { ok: "התפקיד עודכן." };
}

export async function removeMember(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const userId = String(formData.get("user_id") ?? "");
  if (!userId) {
    return { error: GENERIC_ERROR };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_members")
    .delete()
    .eq("business_id", active.businessId)
    .eq("user_id", userId)
    .select("user_id");
  if (error) {
    return {
      error: error.message.includes("last_owner")
        ? "חייב להישאר לעסק לפחות בעלים אחד."
        : GENERIC_ERROR,
    };
  }
  if (data.length === 0) {
    return { error: "אין לכם הרשאה להסיר את המשתמש הזה." };
  }
  revalidatePath("/", "layout");
  return { ok: "המשתמש הוסר." };
}

export async function addWarehouse(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { error: "יש להזין שם מחסן." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("warehouses")
    .insert({ business_id: active.businessId, name });
  if (error) {
    return { error: catalogErrorMessage(error) };
  }
  revalidatePath("/settings");
  return { ok: `המחסן ${name} נוסף.` };
}

export async function renameWarehouse(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { error: "יש להזין שם מחסן." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warehouses")
    .update({ name })
    .eq("id", String(formData.get("warehouse_id") ?? ""))
    .eq("business_id", active.businessId)
    .select("id");
  if (error) {
    return { error: catalogErrorMessage(error) };
  }
  if (data.length === 0) {
    return { error: "רק בעלים או מנהל יכולים לשנות מחסנים." };
  }
  revalidatePath("/settings");
  return { ok: "נשמר." };
}

export async function setDefaultWarehouse(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const warehouseId = String(formData.get("warehouse_id") ?? "");

  const supabase = await createClient();
  // Confirms the warehouse belongs to the active business before changing anything.
  const { data: warehouse } = await supabase
    .from("warehouses")
    .select("id")
    .eq("id", warehouseId)
    .eq("business_id", active.businessId)
    .maybeSingle();
  if (!warehouse) {
    return { error: "המחסן לא נמצא." };
  }
  const { error } = await supabase.rpc("set_default_warehouse", { p_warehouse_id: warehouseId });
  if (error) {
    return { error: catalogErrorMessage(error) };
  }
  revalidatePath("/settings");
  return null;
}

export async function addPosDepartment(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const field = (key: string) => String(formData.get(key) ?? "").trim();
  const code = field("code");
  if (!/^\d{1,9}$/.test(code) || !field("department") || !field("sub_department")) {
    return { error: "צריך קוד מחלקה מספרי, שם מחלקה ושם תת מחלקה, כמו שהם בקופה." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("pos_departments").insert({
    business_id: active.businessId,
    code,
    department: field("department"),
    sub_department: field("sub_department"),
    item_name: field("item_name") || null,
  });
  if (error) {
    return {
      error: error.code === "23505" ? "כבר קיימת מחלקה עם הקוד הזה." : catalogErrorMessage(error),
    };
  }
  revalidatePath("/settings");
  revalidatePath("/receiving/[id]/export", "page");
  return { ok: `המחלקה ${code} נוספה.` };
}

export async function deletePosDepartment(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pos_departments")
    .delete()
    .eq("id", String(formData.get("department_id") ?? ""))
    .eq("business_id", active.businessId)
    .select("id");
  if (error) {
    return { error: catalogErrorMessage(error) };
  }
  if (data.length === 0) {
    return { error: "רק בעלים או מנהל יכולים לשנות מחלקות." };
  }
  revalidatePath("/settings");
  return null;
}
