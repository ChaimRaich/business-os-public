"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { CUSTOMER_STAGES } from "@/lib/suite";
import type { FormState } from "@/components/action-form";

const createSchema = z.object({
  name: z.string().trim().min(1, "יש להזין שם לקוח או ליד.").max(160),
  phone: z.string().trim().max(40).optional().default(""),
  email: z.string().trim().max(160).optional().default(""),
  stage: z.enum(CUSTOMER_STAGES as [typeof CUSTOMER_STAGES[number], ...typeof CUSTOMER_STAGES[number][]]),
  source: z.string().trim().max(80).optional().default(""),
  lifetime_value: z.coerce.number().finite().min(0).default(0),
  notes: z.string().trim().max(1000).optional().default(""),
});

export async function createCustomer(_state: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    stage: formData.get("stage") || "lead",
    source: formData.get("source") ?? "",
    lifetime_value: formData.get("lifetime_value") || 0,
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "בדקו את פרטי הלקוח." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("customers").insert({
    business_id: active.businessId,
    name: parsed.data.name,
    phone: parsed.data.phone || null,
    email: parsed.data.email || null,
    stage: parsed.data.stage,
    source: parsed.data.source || null,
    lifetime_value: parsed.data.lifetime_value,
    notes: parsed.data.notes || null,
  });
  if (error) {
    return { error: "שמירת הלקוח נכשלה." };
  }

  revalidatePath("/crm");
  revalidatePath("/");
  return { ok: "הלקוח נוסף ל-CRM." };
}

export async function updateCustomerStage(_state: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const id = String(formData.get("id") ?? "");
  const stage = z
    .enum(CUSTOMER_STAGES as [typeof CUSTOMER_STAGES[number], ...typeof CUSTOMER_STAGES[number][]])
    .safeParse(formData.get("stage"));
  if (!z.uuid().safeParse(id).success || !stage.success) {
    return { error: "נתונים לא תקינים." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({ stage: stage.data })
    .eq("id", id)
    .eq("business_id", active.businessId);
  if (error) {
    return { error: "עדכון הסטטוס נכשל." };
  }

  revalidatePath("/crm");
  return { ok: "השלב עודכן." };
}

export async function deleteCustomer(_state: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  if (!can(active.role, "crm.delete")) {
    return { error: "רק בעלים או מנהל יכולים למחוק לקוחות." };
  }
  const id = String(formData.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) {
    return { error: "מזהה לא תקין." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .delete()
    .eq("id", id)
    .eq("business_id", active.businessId);
  if (error) {
    return { error: "המחיקה נכשלה." };
  }

  revalidatePath("/crm");
  revalidatePath("/");
  return { ok: "הרשומה נמחקה." };
}
