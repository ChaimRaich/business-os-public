import type { Database } from "@/lib/database.types";

export type Role = Database["public"]["Enums"]["member_role"];

export const ROLES: Role[] = ["owner", "manager", "staff"];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "בעלים",
  manager: "מנהל",
  staff: "עובד",
};

// UI-level mirror of what the database enforces. RLS is the source of truth;
// this only decides what to show.
const PERMISSIONS = {
  "business.edit": ["owner"],
  "members.manage": ["owner"],
  "catalog.delete": ["owner", "manager"],
  "warehouses.manage": ["owner", "manager"],
  "stock.adjust": ["owner", "manager"],
  "departments.manage": ["owner", "manager"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}
