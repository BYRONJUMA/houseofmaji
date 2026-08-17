import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";

/** Roles allowed into the Machines section (pipeline, dashboards, history). */
export const hasMachinesAccess = (role?: string | null) => !!role && role !== "sales_head";

/**
 * Redirects roles without Machines-section access away from Machines pages.
 * Services is an explicit exception and does not use this guard.
 */
export function useMachinesGuard() {
  const { profile, loading } = useAuth();
  const navigate = useNavigate();
  const blocked = !loading && !!profile && !hasMachinesAccess(profile.role);

  useEffect(() => {
    if (blocked) navigate({ to: "/crm", replace: true });
  }, [blocked, navigate]);

  return { blocked };
}
