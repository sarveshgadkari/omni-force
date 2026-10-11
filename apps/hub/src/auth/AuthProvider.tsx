import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { account, auth } from "../lib/api";
import type { Entitlement, Module, ModuleAccess, ModuleKey, Profile } from "../lib/types";

interface Ctx {
  loading: boolean;
  profile: Profile | null;
  isAdmin: boolean;
  /** The user's own entitlements (individual account). */
  entitlements: Entitlement[];
  /** Effective access: own entitlements plus organization seats. Use this to decide what the user may open. */
  access: ModuleAccess[];
  modules: Module[];
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [access, setAccess] = useState<ModuleAccess[]>([]);
  const [modules, setModules] = useState<Module[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [me, mods] = await Promise.all([account.me(), account.modules()]);
      setModules(mods);
      if (me) {
        setProfile(me.profile);
        setIsAdmin(me.isAdmin);
        const [ents, acc] = await Promise.all([account.entitlements(), account.access()]);
        setEntitlements(ents);
        setAccess(acc);
      } else {
        setProfile(null);
        setIsAdmin(false);
        setEntitlements([]);
        setAccess([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    return auth.onChange(() => refresh());
  }, [refresh]);

  const signOut = useCallback(async () => {
    await auth.signOut();
    setProfile(null);
    setIsAdmin(false);
    setEntitlements([]);
    setAccess([]);
  }, []);

  return (
    <AuthCtx.Provider value={{ loading, profile, isAdmin, entitlements, access, modules, refresh, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}

export const isEntitled = (ents: Entitlement[], m: string) =>
  ents.some((e) => e.module_key === m && e.status !== "canceled");

/** May the user open this module (own plan or an organization seat)? */
export const hasAccess = (access: ModuleAccess[], m: ModuleKey) => access.some((a) => a.module_key === m);
