"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { clearLocalReading } from "@/lib/foryou/useReading";
import { clearLocalSaved } from "@/lib/useSaved";

// Signs out of this browser. The browser's copy of the saved papers is
// cleared too, so nothing of the account stays behind on a shared device;
// the account itself keeps everything.
export function SignOutButton({ everywhere = false, className = "" }: { everywhere?: boolean; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    setBusy(true);
    await supabase.auth.signOut({ scope: everywhere ? "global" : "local" });
    clearLocalSaved();
    clearLocalReading();
    router.push("/");
    router.refresh();
  }

  return (
    <button onClick={signOut} disabled={busy} className={className}>
      {busy ? "Signing out…" : everywhere ? "Sign out everywhere" : "Sign out"}
    </button>
  );
}
