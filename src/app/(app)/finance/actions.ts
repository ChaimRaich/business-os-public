"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { ACCOUNT_TYPES, LEDGER_KINDS, LEDGER_STATUSES } from "@/lib/suite";
import type { FormState } from "@/components/action-form";

const accountSchema = z.object({
  name: z.string().trim().min(1, "יש להזין שם לחשבון.").max(120),
  account_type: z.enum(ACCOUNT_TYPES),
  institution: z.string().trim().max(120).optional().default(""),
  account_number_last4: z.string().trim().max(12).optional().default(""),
  balance: z.coerce.number().finite("יתרה לא תקינה.").default(0),
});

const entrySchema = z.object({
  kind: z.enum(LEDGER_KINDS as [typeof LEDGER_KINDS[number], ...typeof LEDGER_KINDS[number][]]),
  status: z.enum(LEDGER_STATUSES as [typeof LEDGER_STATUSES[number], ...typeof LEDGER_STATUSES[number][]]),
  title: z.string().trim().min(1, "יש להזין תיאור לתנועה.").max(200),
  counterparty: z.string().trim().max(160).optional().default(""),
  reference_number: z.string().trim().max(80).optional().default(""),
  account_id: z.string().trim().optional().default(""),
  amount: z.coerce.number().finite("סכום לא תקין.").min(0, "הסכום חייב להיות 0 ומעלה."),
  vat_amount: z.coerce.number().finite("סכום מע״מ לא תקין.").min(0).default(0),
  entry_date: z.string().trim().optional().default(""),
  due_date: z.string().trim().optional().default(""),
});

export async function createFinanceAccount(_state: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  if (!can(active.role, "finance.manage")) {
    return { error: "רק בעלים או מנהל יכולים לנהל חשבונות." };
  }

  const parsed = accountSchema.safeParse({
    name: formData.get("name"),
    account_type: formData.get("account_type"),
    institution: formData.get("institution") ?? "",
    account_number_last4: formData.get("account_number_last4") ?? "",
    balance: formData.get("balance") || 0,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "בדקו את פרטי החשבון." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("finance_accounts").insert({
    business_id: active.businessId,
    name: parsed.data.name,
    account_type: parsed.data.account_type,
    institution: parsed.data.institution || null,
    account_number_last4: parsed.data.account_number_last4 || null,
    balance: parsed.data.balance,
  });
  if (error) {
    return { error: "הוספת החשבון נכשלה." };
  }

  revalidatePath("/finance");
  revalidatePath("/");
  return { ok: "החשבון נוסף בהצלחה." };
}

export async function createLedgerEntry(_state: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  if (!can(active.role, "finance.manage")) {
    return { error: "רק בעלים או מנהל יכולים לרשום תנועות הנה״ח." };
  }

  const parsed = entrySchema.safeParse({
    kind: formData.get("kind"),
    status: formData.get("status") || "pending",
    title: formData.get("title"),
    counterparty: formData.get("counterparty") ?? "",
    reference_number: formData.get("reference_number") ?? "",
    account_id: formData.get("account_id") ?? "",
    amount: formData.get("amount"),
    vat_amount: formData.get("vat_amount") || 0,
    entry_date: formData.get("entry_date") ?? "",
    due_date: formData.get("due_date") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "בדקו את פרטי התנועה." };
  }

  const accountId = z.uuid().safeParse(parsed.data.account_id).success ? parsed.data.account_id : null;
  const supabase = await createClient();
  const { error } = await supabase.from("ledger_entries").insert({
    business_id: active.businessId,
    account_id: accountId,
    kind: parsed.data.kind,
    status: parsed.data.status,
    title: parsed.data.title,
    counterparty: parsed.data.counterparty || null,
    reference_number: parsed.data.reference_number || null,
    amount: parsed.data.amount,
    vat_amount: parsed.data.vat_amount,
    entry_date: parsed.data.entry_date || undefined,
    due_date: parsed.data.due_date || null,
  });
  if (error) {
    return { error: "שמירת התנועה נכשלה." };
  }

  revalidatePath("/finance");
  revalidatePath("/");
  return { ok: "התנועה נרשמה." };
}

export async function markLedgerPaid(_state: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  if (!can(active.role, "finance.manage")) {
    return { error: "אין הרשאה לעדכן תנועה." };
  }
  const id = String(formData.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) {
    return { error: "מזהה לא תקין." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("ledger_entries")
    .update({ status: "paid" })
    .eq("id", id)
    .eq("business_id", active.businessId);
  if (error) {
    return { error: "העדכון נכשל." };
  }

  revalidatePath("/finance");
  revalidatePath("/");
  return { ok: "סומן כשולם." };
}

export async function deleteLedgerEntry(_state: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  if (!can(active.role, "finance.manage")) {
    return { error: "אין הרשאה למחוק תנועה." };
  }
  const id = String(formData.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) {
    return { error: "מזהה לא תקין." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("ledger_entries")
    .delete()
    .eq("id", id)
    .eq("business_id", active.businessId);
  if (error) {
    return { error: "המחיקה נכשלה." };
  }

  revalidatePath("/finance");
  revalidatePath("/");
  return { ok: "התנועה נמחקה." };
}
