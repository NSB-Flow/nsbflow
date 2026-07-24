import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/roles";

interface AuthState {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  fullName: string | null;
  sector: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [fullName, setFullName] = useState<string | null>(null);
  const [sector, setSector] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfileData = async (uid: string | undefined) => {
    if (!uid) {
      setRoles([]);
      setFullName(null);
      setSector(null);
      return;
    }
    const [{ data: r }, { data: p }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("profiles").select("full_name, sector").eq("id", uid).maybeSingle(),
    ]);
    setRoles((r ?? []).map((x) => x.role as AppRole));
    setFullName(p?.full_name ?? null);
    setSector(p?.sector ?? null);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      setTimeout(() => {
        loadProfileData(s?.user?.id);
      }, 0);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      loadProfileData(data.session?.user?.id).finally(() => setLoading(false));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const refresh = async () => {
    await loadProfileData(session?.user?.id);
  };

  return (
    <Ctx.Provider
      value={{ session, user: session?.user ?? null, roles, fullName, sector, loading, refresh }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be inside AuthProvider");
  return v;
}
