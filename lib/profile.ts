"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/lib/auth/useUser";
import { getSupabaseBrowser } from "@/lib/supabase/client";

// The signed-in user's profile row (table profiles). Created by a database
// trigger at sign-up, so it always exists for a signed-in user.
export type Profile = {
  id: string;
  display_name: string | null;
  default_field: string;
  interests: string[]; // topic ids from lib/topics.ts
  onboarded: boolean;
};

export function useProfile() {
  const { user } = useUser();
  const userId = user?.id ?? null;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!userId || !supabase) {
      setProfile(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from("profiles")
      .select("id, display_name, default_field, interests, onboarded")
      .eq("id", userId)
      .single()
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) setError(err.message);
        else setProfile(data as Profile);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  /** Saves part of the profile; the display name is mirrored into the auth metadata for the header. */
  const update = useCallback(
    async (patch: Partial<Omit<Profile, "id">>) => {
      const supabase = getSupabaseBrowser();
      if (!userId || !supabase) throw new Error("Not signed in.");
      const { data, error: err } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", userId)
        .select("id, display_name, default_field, interests, onboarded")
        .single();
      if (err) throw err;
      if (patch.display_name !== undefined) {
        await supabase.auth.updateUser({ data: { display_name: patch.display_name } });
      }
      setProfile(data as Profile);
      return data as Profile;
    },
    [userId],
  );

  return { profile, loading, error, update, signedIn: userId !== null };
}
