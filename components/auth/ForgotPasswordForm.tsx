"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AuthCard, Field, FormMessage, Submit, linkClass } from "@/components/auth/ui";
import { friendlyAuthError } from "@/lib/auth/messages";
import { getSupabaseBrowser } from "@/lib/supabase/client";

// Sends the password reset email. The answer is the same whether or not the
// address has an account, so the form cannot be used to check who is signed up.
export function ForgotPasswordForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    const supabase = getSupabaseBrowser();
    if (!supabase) return setError("Accounts are not switched on for this site.");
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setBusy(false);
    if (err) return setError(friendlyAuthError(err.message));
    setSent(true);
  }

  return (
    <AuthCard
      title="Reset your password."
      lead="Enter the email you signed up with and we will send you a link to choose a new password."
      footer={
        <Link href="/login" className={linkClass}>
          Back to log in
        </Link>
      }
    >
      {sent ? (
        <FormMessage tone="success">If that address has an account, a reset link is on its way. It is valid for one hour.</FormMessage>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <Field label="Email" name="email" type="email" autoComplete="email" required />
          {error && <FormMessage tone="error">{error}</FormMessage>}
          <Submit busy={busy}>Send reset link</Submit>
        </form>
      )}
    </AuthCard>
  );
}
