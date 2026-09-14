import { useEffect, useState, createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "sales_rep" | "chief_engineer" | "engineer" | "admin" | "sales_head";

export type Profile = {
  id: string;
  full_name: string;
  /** Primary (highest-priority) role, or null for equipment-only users. */
  role: AppRole | null;
  created_at: string;
};

type AuthValue = {
  session: Session | null;
  profile: Profile | null;
  /** Every role this user holds — permissions are the union of all of them. */
  roles: string[];
  hasRole: (role: string) => boolean;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue>({
  session: null,
  profile: null,
  roles: [],
  hasRole: () => false,
  loading: true,
  signOut: async () => {},
});

/** Highest-priority role first — used to pick a landing page and a display label. */
export const ROLE_PRIORITY = ["admin", "chief_engineer", "sales_head", "engineer", "sales_rep"];

export function primaryRole(roles: string[]): AppRole | null {
  for (const r of ROLE_PRIORITY) if (roles.includes(r)) return r as AppRole;
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) {
        setProfile(null);
        setRoles([]);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const uid = session?.user.id;
    if (!uid) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const [{ data: prof }, { data: roleRows }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, role, created_at")
          .eq("id", uid)
          .maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", uid),
      ]);
      if (cancelled) return;
      const list = (roleRows ?? []).map((r) => r.role as string);
      setRoles(list);
      setProfile(
        prof ? ({ ...prof, role: primaryRole(list) ?? prof.role ?? null } as Profile) : null,
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user.id]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setRoles([]);
  };

  const hasRole = (role: string) => roles.includes(role);

  return (
    <AuthContext.Provider value={{ session, profile, roles, hasRole, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

/** All roles for every user, keyed by user id — for team pickers and lists. */
export function useAllUserRoles() {
  const { data } = useQuery({
    queryKey: ["all-user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      const map: Record<string, string[]> = {};
      for (const r of data ?? []) (map[r.user_id] ??= []).push(r.role as string);
      return map;
    },
  });
  return data ?? {};
}

/** Does this person hold any of the given roles? Falls back to their primary role. */
export function personHasRole(
  map: Record<string, string[]>,
  person: { id: string; role?: string | null },
  ...wanted: string[]
) {
  const list = map[person.id] ?? (person.role ? [person.role] : []);
  return wanted.some((w) => list.includes(w));
}
