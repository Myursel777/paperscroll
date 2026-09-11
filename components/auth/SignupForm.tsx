"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AuthCard, Field, FormMessage, Submit, linkClass } from "@/components/auth/ui";
import { friendlyAuthError } from "@/lib/auth/messages";
import { getSupabaseBrowser } from "@/lib/supabase/client";

// Email and password sign-up. Supabase sends a confirmation email; the link
// in it lands on /auth/callback, which signs the user in and sends them to
// onboarding. Until then this page shows a "check your inbox" state.
export function SignupForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const displayName = String(form.get("display_name") ?? "").trim();
    if (password.length < 8) return setError("Please choose a password of at least 8 characters.");

    const supabase = getSupabaseBrowser();
    if (!supabase) return setError("Accounts are not switched on for this site.");
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName || email.split("@")[0] },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
      },
    });
    setBusy(false);
    if (err) return setError(friendlyAuthError(err.message));
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <AuthCard title="Check your inbox." lead={<>We sent a confirmation link to <strong className="text-ink">{sentTo}</strong>. Open it on this device to finish creating your account.</>}>
        <FormMessage tone="success">Nothing else to do here. You can close this page.</FormMessage>
        <p className="mt-6 text-sm text-muted">
          No email after a few minutes? Check the spam folder, or{" "}
          <button onClick={() => setSentTo(null)} className={linkClass}>
            try again
          </button>
          .
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your account."
      lead="Your saved papers follow you across devices, and For You learns from everything you read."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className={linkClass}>
            Log in
          </Link>
          .
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <Field label="Name" name="display_name" autoComplete="name" placeholder="How should we greet you?" maxLength={60} />
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Password" name="password" type="password" autoComplete="new-password" required minLength={8} hint="At least 8 characters." />
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <Submit busy={busy}>Create account</Submit>
        <p className="text-xs leading-relaxed text-muted">
          By creating an account you agree to the{" "}
          <Link href="/terms" className={linkClass}>
            terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className={linkClass}>
            privacy notes
          </Link>
          .
        </p>
      </form>
    </AuthCard>
  );
}
