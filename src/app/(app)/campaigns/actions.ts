"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { CAMPAIGN_CHANNELS, CAMPAIGN_STATUSES } from "@/lib/suite";
import type { FormState } from "@/components/action-form";

const createSchema = z.object({
  name: z.string().trim().min(1, "יש להזין שם לקמפיין.").max(160),
  channel: z.enum(CAMPAIGN_CHANNELS as [typeof CAMPAIGN_CHANNELS[number], ...typeof CAMPAIGN_CHANNELS[number][]]),
  status: z.enum(CAMPAIGN_STATUSES as [typeof CAMPAIGN_STATUSES[number], ...typeof CAMPAIGN_STATUSES[number][]]),
  budget: z.coerce.number().finite().min(0).default(0),
  spent: z.coerce.number().finite().min(0).default(0),
  leads_count: z.coerce.number().int().min(0).default(0),
  conversions_count: z.coerce.number().int().min(0).default(0),
  revenue: z.coerce.number().finite().min(0).default(0),
  start_date: z.string().trim().optional().default(""),
  end_date: z.string().trim().optional().default(""),
});

export async function createCampaign(_state: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  if (!can(active.role, "campaigns.manage")) {
    return { error: "רק בעלים או מנהל יכולים ליצור קמפיינים." };
  }

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    channel: formData.get("channel"),
    status: formData.get("status") || "draft",
    budget: formData.get("budget") || 0,
    spent: formData.get("spent") || 0,
    leads_count: formData.get("leads_count") || 0,
    conversions_count: formData.get("conversions_count") || 0,
    revenue: formData.get("revenue") || 0,
    start_date: formData.get("start_date") ?? "",
    end_date: formData.get("end_date") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "בדקו את פרטי הקמפיין." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("campaigns").insert({
    business_id: active.businessId,
    name: parsed.data.name,
    channel: parsed.data.channel,
    status: parsed.data.status,
    budget: parsed.data.budget,
    spent: parsed.data.spent,
    leads_count: parsed.data.leads_count,
    conversions_count: parsed.data.conversions_count,
    revenue: parsed.data.revenue,
    start_date: parsed.data.start_date || null,
    end_date: parsed.data.end_date || null,
  });
  if (error) {
    return { error: "יצירת הקמפיין נכשלה." };
  }

  revalidatePath("/campaigns");
  revalidatePath("/");
  return { ok: "הקמפיין נוצר בהצלחה." };
}

export async function updateCampaignStatus(_state: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  if (!can(active.role, "campaigns.manage")) {
    return { error: "אין הרשאה לעדכן קמפיין." };
  }

  const id = String(formData.get("id") ?? "");
  const status = formData.get("status");
  const validStatus = z
    .enum(CAMPAIGN_STATUSES as [typeof CAMPAIGN_STATUSES[number], ...typeof CAMPAIGN_STATUSES[number][]])
    .safeParse(status);

  if (!z.uuid().safeParse(id).success || !validStatus.success) {
    return { error: "נתונים לא תקינים." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("campaigns")
    .update({ status: validStatus.data })
    .eq("id", id)
    .eq("business_id", active.businessId);
  if (error) {
    return { error: "העדכון נכשל." };
  }

  revalidatePath("/campaigns");
  revalidatePath("/");
  return { ok: "סטטוס הקמפיין עודכן." };
}

export async function deleteCampaign(_state: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  if (!can(active.role, "campaigns.manage")) {
    return { error: "אין הרשאה למחוק קמפיין." };
  }
  const id = String(formData.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) {
    return { error: "מזהה לא תקין." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("campaigns")
    .delete()
    .eq("id", id)
    .eq("business_id", active.businessId);
  if (error) {
    return { error: "המחיקה נכשלה." };
  }

  revalidatePath("/campaigns");
  revalidatePath("/");
  return { ok: "הקמפיין נמחק." };
}
