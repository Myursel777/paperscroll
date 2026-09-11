"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/lib/auth/useUser";
import { getSupabaseBrowser } from "@/lib/supabase/client";

// Named folders for saved papers (table collections). Signed-in only; the
// library page is behind the login wall so this is never used logged out.
export type Collection = { id: string; name: string; created_at: string };

export function useCollections() {
  const { user } = useUser();
  const userId = user?.id ?? null;
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    if (!userId || !supabase) return;
    const { data, error } = await supabase
      .from("collections")
      .select("id, name, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (!error) setCollections(data as Collection[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setCollections([]);
      setLoading(false);
      return;
    }
    void refresh();
  }, [userId, refresh]);

  const create = useCallback(
    async (name: string) => {
      const supabase = getSupabaseBrowser();
      if (!userId || !supabase) throw new Error("Not signed in.");
      const { data, error } = await supabase
        .from("collections")
        .insert({ user_id: userId, name: name.trim() })
        .select("id, name, created_at")
        .single();
      if (error) throw new Error(error.code === "23505" ? "You already have a collection with that name." : error.message);
      setCollections((prev) => [...prev, data as Collection]);
      return data as Collection;
    },
    [userId],
  );

  const rename = useCallback(
    async (id: string, name: string) => {
      const supabase = getSupabaseBrowser();
      if (!userId || !supabase) throw new Error("Not signed in.");
      const { error } = await supabase.from("collections").update({ name: name.trim() }).eq("id", id).eq("user_id", userId);
      if (error) throw new Error(error.code === "23505" ? "You already have a collection with that name." : error.message);
      setCollections((prev) => prev.map((c) => (c.id === id ? { ...c, name: name.trim() } : c)));
    },
    [userId],
  );

  const remove = useCallback(
    async (id: string) => {
      const supabase = getSupabaseBrowser();
      if (!userId || !supabase) throw new Error("Not signed in.");
      // Papers in it are kept; the database sets their collection to null.
      const { error } = await supabase.from("collections").delete().eq("id", id).eq("user_id", userId);
      if (error) throw new Error(error.message);
      setCollections((prev) => prev.filter((c) => c.id !== id));
    },
    [userId],
  );

  return { collections, loading, create, rename, remove };
}
