import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { accountsEnabled, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";

// Supabase client for server components, server actions, and route handlers.
// It reads the session from the request cookies. Writing cookies is only
// possible in actions and route handlers; in a server component the attempt
// is ignored, which is fine because middleware.ts has refreshed them already.
export function getSupabaseServer() {
  if (!accountsEnabled) return null;
  const store = cookies();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a server component: cookies are read-only there.
        }
      },
    },
  });
}

/** The signed-in user, or null when accounts are off or nobody is signed in. */
export async function getCurrentUser() {
  const supabase = getSupabaseServer();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}
