"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { accountsEnabled, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";

// Supabase client for code that runs in the browser (components, hooks).
// One instance per tab; the library keeps the session in cookies so the
// server (see server.ts and middleware.ts) sees the same login.
let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient | null {
  if (!accountsEnabled) return null;
  browserClient ??= createBrowserClient(supabaseUrl, supabaseAnonKey);
  return browserClient;
}
