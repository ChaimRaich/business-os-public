import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/permissions";

export const ACTIVE_BUSINESS_COOKIE = "bos_business";

export type CurrentUser = { id: string; email: string };
export type Membership = {
  businessId: string;
  businessName: string;
  role: Role;
  onboardingCompletedAt: string | null;
};
export type BusinessContext = {
  user: CurrentUser;
  memberships: Membership[];
  active: Membership;
};

/** The signed-in user, or a redirect to /login. Verified against Supabase Auth. */
export const requireUser = cache(async (): Promise<CurrentUser> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    redirect("/login");
  }
  return { id: data.user.id, email: data.user.email ?? "" };
});

/** Businesses the user belongs to. RLS already limits rows to the caller's memberships. */
export const getMemberships = cache(async (): Promise<Membership[]> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_members")
    .select("role, businesses (id, name, onboarding_completed_at)")
    .eq("user_id", user.id)
    .order("created_at");
  if (error) {
    throw new Error(`Failed to load memberships: ${error.message}`);
  }
  return data.map((row) => ({
    businessId: row.businesses.id,
    businessName: row.businesses.name,
    role: row.role,
    onboardingCompletedAt: row.businesses.onboarding_completed_at,
  }));
});

/**
 * The user plus the business they are currently working in,
 * or null when the user doesn't belong to any business yet.
 */
export const getBusinessContext = cache(async (): Promise<BusinessContext | null> => {
  const user = await requireUser();
  const memberships = await getMemberships();
  if (memberships.length === 0) {
    return null;
  }
  const wanted = (await cookies()).get(ACTIVE_BUSINESS_COOKIE)?.value;
  const active = memberships.find((m) => m.businessId === wanted) ?? memberships[0];
  return { user, memberships, active };
});

/** Like getBusinessContext, for code that only runs once a business exists. */
export async function requireBusiness(): Promise<BusinessContext> {
  // The app shell at "/" shows the create-business form when there is none.
  return (await getBusinessContext()) ?? redirect("/");
}
