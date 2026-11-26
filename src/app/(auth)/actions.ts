"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/components/action-form";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function isConnectionError(error: { name?: string; status?: number; message?: string }) {
  return (
    error.name === "AuthRetryableFetchError" ||
    error.status === 0 ||
    /fetch failed|ECONNREFUSED|Failed to fetch/i.test(error.message ?? "")
  );
}

const NO_SUPABASE_ERROR =
  "אין חיבור ל-Supabase (127.0.0.1:54321). הפעילו npx supabase start (עם Docker) או חברו פרויקט Supabase בענן ב-.env.local.";

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const email = text(formData, "email");
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: "יש למלא אימייל וסיסמה." };
  }

  const supabase = await createClient();
  let error: { code?: string; name?: string; status?: number; message?: string } | null = null;
  try {
    ({ error } = await supabase.auth.signInWithPassword({ email, password }));
  } catch {
    return { error: NO_SUPABASE_ERROR };
  }
  if (error) {
    if (isConnectionError(error)) {
      return { error: NO_SUPABASE_ERROR };
    }
    return {
      error:
        error.code === "invalid_credentials"
          ? "האימייל או הסיסמה שגויים."
          : "ההתחברות נכשלה. נסו שוב בעוד רגע.",
    };
  }
  // The browser may hold pages (and redirects) cached for the previous session.
  revalidatePath("/", "layout");
  redirect("/");
}

export async function signup(_: FormState, formData: FormData): Promise<FormState> {
  const fullName = text(formData, "full_name");
  const email = text(formData, "email");
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: "יש למלא אימייל וסיסמה." };
  }
  if (password.length < 8) {
    return { error: "הסיסמה צריכה להכיל לפחות 8 תווים." };
  }

  const supabase = await createClient();
  let data: { session: unknown } | null = null;
  let error: { code?: string; name?: string; status?: number; message?: string } | null = null;
  try {
    ({ data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    }));
  } catch {
    return { error: NO_SUPABASE_ERROR };
  }
  if (error) {
    if (isConnectionError(error)) {
      return { error: NO_SUPABASE_ERROR };
    }
    return {
      error:
        error.code === "user_already_exists"
          ? "כבר קיים חשבון עם האימייל הזה."
          : error.code === "weak_password"
            ? "הסיסמה חלשה מדי. בחרו סיסמה ארוכה יותר."
            : "ההרשמה נכשלה. נסו שוב בעוד רגע.",
    };
  }
  if (!data?.session) {
    return { ok: "שלחנו אליכם אימייל לאישור החשבון. אחרי האישור אפשר להתחבר." };
  }
  // The browser may hold pages (and redirects) cached for the previous session.
  revalidatePath("/", "layout");
  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
