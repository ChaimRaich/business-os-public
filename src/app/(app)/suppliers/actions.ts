"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { catalogErrorMessage, optional, text } from "@/lib/catalog";
import type { FormState } from "@/components/action-form";

function supplierFields(formData: FormData) {
  return {
    name: text(formData, "name"),
    tax_id: optional(formData, "tax_id"),
    phone: optional(formData, "phone"),
    address: optional(formData, "address"),
    pos_code: optional(formData, "pos_code"),
    pos_name: optional(formData, "pos_name"),
    notes: optional(formData, "notes"),
  };
}

export async function createSupplier(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const fields = supplierFields(formData);
  if (!fields.name) {
    return { error: "יש להזין שם ספק." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .insert({ ...fields, business_id: active.businessId });
  if (error) {
    return { error: catalogErrorMessage(error) };
  }
  revalidatePath("/suppliers");
  return { ok: `הספק ${fields.name} נוסף.` };
}

export async function updateSupplier(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const id = text(formData, "id");
  const fields = supplierFields(formData);
  if (!id || !fields.name) {
    return { error: "יש להזין שם ספק." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .update(fields)
    .eq("id", id)
    .eq("business_id", active.businessId)
    .select("id");
  if (error) {
    return { error: catalogErrorMessage(error) };
  }
  if (data.length === 0) {
    return { error: "הספק לא נמצא." };
  }
  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${id}`);
  return { ok: "הפרטים נשמרו." };
}
