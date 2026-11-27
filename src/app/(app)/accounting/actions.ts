"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { optional, text } from "@/lib/catalog";
import { parseAmount } from "@/lib/documents";
import { isExpenseCategory, isIsoDate, todayInIsrael } from "@/lib/accounting";
import type { FormState } from "@/components/action-form";

/** Money screens are for owner / manager. The database enforces the same rule. */
async function requireManager() {
  const context = await requireBusiness();
  if (!can(context.active.role, "accounting.view")) {
    throw new Error("forbidden");
  }
  return context;
}

/** intent "paid" marks it paid today, "unpaid" undoes that, "due" only saves the due date. */
function paymentFields(formData: FormData): { due_date?: string | null; paid_at?: string | null } {
  const intent = text(formData, "intent");
  if (intent === "unpaid") {
    return { paid_at: null };
  }
  const due = text(formData, "due_date");
  if (due && !isIsoDate(due)) {
    throw new Error("invalid due date");
  }
  return intent === "paid" ? { due_date: due || null, paid_at: todayInIsrael() } : { due_date: due || null };
}

export async function setDocumentPayment(formData: FormData): Promise<void> {
  const { active, user } = await requireManager();
  const id = text(formData, "id");
  const fields = paymentFields(formData);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document_payments")
    .update({ ...fields, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq("document_id", id)
    .eq("business_id", active.businessId)
    .select("document_id");
  if (error) {
    throw new Error(`Failed to save payment: ${error.message}`);
  }
  if (data.length === 0) {
    // The pair (document, business) is a foreign key, so a document of another business is refused.
    const { error: insertError } = await supabase
      .from("document_payments")
      .insert({ document_id: id, business_id: active.businessId, ...fields });
    if (insertError) {
      throw new Error(`Failed to save payment: ${insertError.message}`);
    }
  }
  revalidatePath("/accounting");
}

export async function setExpensePayment(formData: FormData): Promise<void> {
  const { active } = await requireManager();
  const supabase = await createClient();
  const { error } = await supabase
    .from("expenses")
    .update(paymentFields(formData))
    .eq("id", text(formData, "id"))
    .eq("business_id", active.businessId);
  if (error) {
    throw new Error(`Failed to save payment: ${error.message}`);
  }
  revalidatePath("/accounting");
}

export async function createExpense(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireManager();
  const date = text(formData, "expense_date");
  const vendor = text(formData, "vendor");
  const category = text(formData, "category");
  const net = parseAmount(text(formData, "amount_net"));
  const vat = parseAmount(text(formData, "vat_amount"));
  const due = text(formData, "due_date");
  if (!isIsoDate(date)) {
    return { error: "יש לבחור תאריך." };
  }
  if (!vendor) {
    return { error: "יש להזין למי שולם." };
  }
  if (net === null || net === undefined) {
    return { error: "יש להזין סכום לפני מע״מ, במספרים." };
  }
  if (vat === undefined) {
    return { error: "המע״מ צריך להיות מספר, או להישאר ריק." };
  }
  if (due && !isIsoDate(due)) {
    return { error: "מועד התשלום אינו תאריך תקין." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("expenses").insert({
    business_id: active.businessId,
    expense_date: date,
    vendor,
    category: isExpenseCategory(category) ? category : "other",
    description: optional(formData, "description"),
    doc_number: optional(formData, "doc_number"),
    amount_net: net,
    vat_amount: vat ?? 0,
    due_date: due || null,
    paid_at: formData.get("paid") ? date : null,
  });
  if (error) {
    return { error: error.code === "23514" || error.code === "22001" ? "אחד השדות ארוך מדי." : "ההוצאה לא נשמרה. נסו שוב בעוד רגע." };
  }
  revalidatePath("/accounting");
  return { ok: `ההוצאה ל${vendor} נשמרה.` };
}

export async function deleteExpense(formData: FormData): Promise<void> {
  const { active } = await requireManager();
  const supabase = await createClient();
  const { error } = await supabase
    .from("expenses")
    .delete()
    .eq("id", text(formData, "id"))
    .eq("business_id", active.businessId);
  if (error) {
    throw new Error(`Failed to delete expense: ${error.message}`);
  }
  revalidatePath("/accounting");
}
