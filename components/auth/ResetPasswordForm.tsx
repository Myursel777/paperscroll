"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthCard, Field, FormMessage, Submit, linkClass } from "@/components/auth/ui";
import { friendlyAuthError } from "@/lib/auth/messages";
import { useUser } from "@/lib/auth/useUser";
import { getSupabaseBrowser } from "@/lib/supabase/client";

// Reached from the reset email: /auth/callback has exchanged the link's code
// for a session, so the user is signed in and may set a new password.
export function ResetPasswordForm() {
  const router = useRouter();
  const { user, loading } = useUser();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password.length < 8) return setError("Please choose a password of at least 8 characters.");
    if (password !== String(form.get("confirm") ?? "")) return setError("The two passwords do not match.");

    const supabase = getSupabaseBrowser();
    if (!supabase) return setError("Accounts are not switched on for this site.");
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(friendlyAuthError(err.message));
    setDone(true);
    setTimeout(() => {
      router.push("/");
      router.refresh();
    }, 1200);
  }

  if (!loading && !user) {
    return (
      <AuthCard title="This link has expired." lead="Reset links are valid for one hour and can be used once.">
        <Link href="/forgot-password" className={linkClass}>
          Request a new link
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password.">
      {done ? (
        <FormMessage tone="success">Password updated. Taking you back to the feed.</FormMessage>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <Field label="New password" name="password" type="password" autoComplete="new-password" required minLength={8} hint="At least 8 characters." />
          <Field label="Repeat it" name="confirm" type="password" autoComplete="new-password" required />
          {error && <FormMessage tone="error">{error}</FormMessage>}
          <Submit busy={busy || loading}>Save password</Submit>
        </form>
      )}
    </AuthCard>
  );
}
