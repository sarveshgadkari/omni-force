import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** Demo mode runs the whole hub on in-memory sample data (no Supabase needed). */
export const DEMO = import.meta.env.VITE_DEMO === "1" || !url || !key;

export const supabase: SupabaseClient | null = DEMO
  ? null
  : createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });

export const LANDING_URL = (import.meta.env.VITE_LANDING_URL as string | undefined) ?? "/";
