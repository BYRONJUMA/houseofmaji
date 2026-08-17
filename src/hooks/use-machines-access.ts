/**
 * Every signed-in role can view the Machines section (read-only for Sales Head).
 */
export const hasMachinesAccess = (role?: string | null) => !!role;

/** Roles allowed to perform write actions inside the Machines section. */
export const canManageMachines = (role?: string | null) =>
  role === "admin" || role === "chief_engineer" || role === "engineer" || role === "sales_rep";

/** Kept for compatibility — no role is locked out of the Machines section any more. */
export function useMachinesGuard() {
  return { blocked: false };
}
