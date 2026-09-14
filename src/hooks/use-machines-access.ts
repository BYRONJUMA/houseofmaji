import { hasAnyRole, roleList, type RoleInput } from "@/lib/crm";

/**
 * Every signed-in role can view the Machines section (read-only for Sales Head).
 * Users with no role at all only get their own profile page.
 */
export const hasMachinesAccess = (v?: RoleInput) => roleList(v).length > 0;

/** Roles allowed to perform write actions inside the Machines section. */
export const canManageMachines = (v?: RoleInput) =>
  hasAnyRole(v, "admin", "chief_engineer", "engineer", "sales_rep");

/** Kept for compatibility — no role is locked out of the Machines section any more. */
export function useMachinesGuard() {
  return { blocked: false };
}
