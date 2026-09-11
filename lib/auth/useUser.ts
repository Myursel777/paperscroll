"use client";

import type { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { accountsEnabled } from "@/lib/supabase/config";

// The signed-in user as seen from the browser, kept in sync with logins and
// logouts in this tab and others. `loading` is true only until the first
// answer; with accounts off it is false from the start and `user` is null.
export function useUser() {
  const [state, setState] = useState<{ user: User | null; loading: boolean }>({
    user: null,
    loading: accountsEnabled,
  });

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    let cancelled = false;

    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setState({ user: data.user ?? null, loading: false });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setState({ user: session?.user ?? null, loading: false });
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

/** A short label for the account button: the display name's first letter, else the email's. */
export function userInitial(user: User): string {
  const name = (user.user_metadata?.display_name as string | undefined) ?? user.email ?? "?";
  return name.trim().charAt(0).toUpperCase() || "?";
}
