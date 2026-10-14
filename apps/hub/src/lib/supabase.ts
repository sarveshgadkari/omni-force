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

/**
 * Customers buy plans themselves (Stripe checkout) only when VITE_SELF_SERVE_BILLING=1.
 * Default: people create an account, and a platform admin gives them access to products.
 */
export const selfServeBilling = () => import.meta.env.VITE_SELF_SERVE_BILLING === "1";

export const LANDING_URL = (import.meta.env.VITE_LANDING_URL as string | undefined) ?? "/";
