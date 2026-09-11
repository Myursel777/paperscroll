"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, FormMessage } from "@/components/auth/ui";
import { useProfile } from "@/lib/profile";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { clearLocalSaved, useSaved } from "@/lib/useSaved";

// Everything the account holds, to take away or to delete. Export builds a
// JSON file in the browser; delete calls the delete_own_account function in
// the database, which cascades to the profile, collections, and saved papers.
export function DataPanel() {
  const router = useRouter();
  const { profile } = useProfile();
  const { saved } = useSaved();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function exportJson() {
    const payload = { exportedAt: new Date().toISOString(), profile, savedPapers: saved };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `paperscroll-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteAccount() {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc("delete_own_account");
    if (err) {
      setBusy(false);
      return setError(err.message);
    }
    await supabase.auth.signOut({ scope: "local" });
    clearLocalSaved();
    router.push("/");
    router.refresh();
  }

  return (
    <section className="space-y-12">
      <div>
        <h1 className="font-display text-3xl font-semibold">Your data</h1>
        <p className="mt-2 text-muted">
          The account holds your profile, your settings, and your saved papers. Nothing else is
          collected.
        </p>
        <button
          onClick={exportJson}
          className="mt-6 rounded-full border border-line px-5 py-2.5 text-sm font-semibold transition active:scale-95"
        >
          Download everything as JSON
        </button>
        <p className="mt-2 text-xs text-muted">{saved.length} saved papers.</p>
      </div>

      <div>
        <h2 className="font-display text-2xl font-semibold">Delete account</h2>
        <p className="mt-2 text-muted">
          Removes the account and everything in it, permanently. Papers saved in this browser
          are removed too. Type <strong className="text-ink">delete</strong> to confirm.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (confirm.trim().toLowerCase() === "delete") void deleteAccount();
          }}
          className="mt-4 max-w-md space-y-4"
        >
          <Field label="Confirmation" name="confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          {error && <FormMessage tone="error">{error}</FormMessage>}
          <button
            type="submit"
            disabled={busy || confirm.trim().toLowerCase() !== "delete"}
            className="rounded-full bg-[#FF4D2E] px-5 py-2.5 text-sm font-semibold text-onAccent transition active:scale-95 disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Delete my account"}
          </button>
        </form>
      </div>
    </section>
  );
}
