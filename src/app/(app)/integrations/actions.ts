"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import {
  getProviderMeta,
  INTEGRATION_CATEGORY_IDS,
  maskCredential,
  type IntegrationCategory,
} from "@/lib/integrations";
import type { FormState } from "@/components/action-form";

const saveSchema = z.object({
  category: z.enum(INTEGRATION_CATEGORY_IDS as [IntegrationCategory, ...IntegrationCategory[]]),
  provider: z.string().trim().min(1, "יש לבחור ספק אינטגרציה.").max(80),
  mode: z.enum(["live", "sandbox"]),
  account_ref: z.string().trim().max(160).optional().default(""),
  api_key: z.string().trim().max(256).optional().default(""),
});

export async function saveIntegration(_state: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  if (!can(active.role, "integrations.manage")) {
    return { error: "רק בעלים או מנהל יכולים להגדיר אינטגרציות." };
  }

  const parsed = saveSchema.safeParse({
    category: formData.get("category"),
    provider: formData.get("provider"),
    mode: formData.get("mode") || "sandbox",
    account_ref: formData.get("account_ref") ?? "",
    api_key: formData.get("api_key") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "בדקו את הפרטים שהוזנו." };
  }

  const { category, provider, mode, account_ref, api_key } = parsed.data;
  const providerMeta = getProviderMeta(category, provider);
  if (!providerMeta) {
    return { error: "הספק שנבחר אינו תקין לקטגוריה זו." };
  }

  if (mode === "live" && !account_ref && !api_key) {
    return { error: "בחיבור חי יש להזין לפחות מזהה חשבון או מפתח API (או לבחור מצב Sandbox / ידני)." };
  }

  const supabase = await createClient();
  const existing = await supabase
    .from("business_integrations")
    .select("credential_hint")
    .eq("business_id", active.businessId)
    .eq("category", category)
    .maybeSingle();

  const credentialHint = maskCredential(api_key) ?? existing.data?.credential_hint ?? null;
  const status = mode === "live" ? "connected" : "sandbox";

  const { error } = await supabase.from("business_integrations").upsert(
    {
      business_id: active.businessId,
      category,
      provider,
      display_name: providerMeta.name,
      mode,
      status,
      account_ref: account_ref || null,
      credential_hint: mode === "live" ? credentialHint : null,
      last_synced_at: new Date().toISOString(),
      last_error: null,
      config: { configured_via: "app" },
    },
    { onConflict: "business_id,category" },
  );

  if (error) {
    return { error: "שמירת האינטגרציה נכשלה. נסו שוב בעוד רגע." };
  }

  revalidatePath("/", "layout");
  revalidatePath("/integrations");
  return { ok: mode === "live" ? `${providerMeta.name} חובר בהצלחה.` : `${providerMeta.name} הוגדר במצב Sandbox / ידני.` };
}

export async function syncIntegration(_state: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  if (!can(active.role, "integrations.manage")) {
    return { error: "רק בעלים או מנהל יכולים להפעיל סנכרון." };
  }
  const id = String(formData.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) {
    return { error: "מזהה אינטגרציה לא תקין." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("business_integrations")
    .update({ last_synced_at: new Date().toISOString(), last_error: null })
    .eq("id", id)
    .eq("business_id", active.businessId);

  if (error) {
    return { error: "הסנכרון נכשל." };
  }

  revalidatePath("/integrations");
  revalidatePath("/");
  return { ok: "הסנכרון הושלם." };
}

export async function completeOnboarding(): Promise<FormState> {
  const { active } = await requireBusiness();
  if (!can(active.role, "integrations.manage")) {
    return { error: "רק בעלים או מנהל יכולים להשלים את אתחול העסק." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_business_onboarding", {
    p_business_id: active.businessId,
  });

  if (error) {
    if (error.message.includes("integrations_incomplete")) {
      return { error: "יש להגדיר את כל 4 קטגוריות האינטגרציה לפני הכניסה למערכת." };
    }
    return { error: "השלמת האתחול נכשלה. נסו שוב." };
  }

  revalidatePath("/", "layout");
  return { ok: "האתחול הושלם! מעביר לסביבת העבודה…" };
}
