"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseAmount } from "@/lib/documents";
import { stockErrorMessage } from "@/lib/stock";
import type { FormState } from "@/components/action-form";

const Adjustment = z.object({
  variant_id: z.uuid(),
  warehouse_id: z.uuid(),
  request_id: z.uuid(),
  document_id: z.uuid().or(z.literal("")),
  direction: z.enum(["add", "remove"]),
  quantity: z.string(),
  reason: z.string().trim().max(300),
});

export async function adjustStock(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const parsed = Adjustment.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "הטופס לא נשלח כראוי. רעננו את העמוד ונסו שוב." };
  }
  const input = parsed.data;
  const quantity = parseAmount(input.quantity);
  if (!quantity) {
    return { error: "יש להזין כמות גדולה מאפס." };
  }
  if (!input.reason) {
    return { error: "חובה לכתוב סיבה להתאמה." };
  }

  const supabase = await createClient();
  // The warehouse must belong to the business the user is working in.
  const { data: warehouse } = await supabase
    .from("warehouses")
    .select("id")
    .eq("id", input.warehouse_id)
    .eq("business_id", active.businessId)
    .maybeSingle();
  if (!warehouse) {
    return { error: "המחסן לא נמצא." };
  }

  const { data: applied, error } = await supabase.rpc("adjust_stock", {
    p_warehouse_id: input.warehouse_id,
    p_variant_id: input.variant_id,
    p_quantity: input.direction === "add" ? quantity : -quantity,
    p_reason: input.reason,
    p_request_id: input.request_id,
    p_document_id: input.document_id || undefined,
  });
  if (error) {
    return { error: stockErrorMessage(error) };
  }
  revalidatePath("/stock/adjust");
  revalidatePath("/products", "layout");
  return { ok: applied ? "ההתאמה נרשמה והיתרה עודכנה." : "ההתאמה הזו כבר נרשמה." };
}
