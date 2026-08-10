import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Deletes a user's profile row and their auth account.
 * Admin-only; blocked while the user is still assigned to an active order.
 */
export const deleteAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: me, error: meError } = await context.supabase
      .from("profiles")
      .select("role")
      .eq("id", context.userId)
      .maybeSingle();
    if (meError) throw new Error(meError.message);
    if (me?.role !== "admin") throw new Error("Only admins can delete users");
    if (data.userId === context.userId) throw new Error("You cannot delete your own account");

    const { count, error: refError } = await context.supabase
      .from("fulfillments")
      .select("id", { count: "exact", head: true })
      .neq("current_stage", "installed")
      .or(
        `sales_rep_id.eq.${data.userId},assembly_engineer_id.eq.${data.userId},installation_engineer_id.eq.${data.userId}`,
      );
    if (refError) throw new Error(refError.message);
    if ((count ?? 0) > 0) {
      throw new Error(
        `This user is assigned to ${count} active order(s) — reassign or complete those first`,
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
