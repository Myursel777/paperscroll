"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthCard, Field, FormMessage, Submit, linkClass } from "@/components/auth/ui";
import { friendlyAuthError, safeNext } from "@/lib/auth/messages";
import { getSupabaseBrowser } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const linkProblem = params.get("error") === "link";

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const supabase = getSupabaseBrowser();
    if (!supabase) return setError("Accounts are not switched on for this site.");
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    });
    if (err) {
      setBusy(false);
      return setError(friendlyAuthError(err.message));
    }
    // Onboarding used to be reachable only through the emailed confirmation
    // link. Anyone who opened that link in a different browser, or who signs
    // in later on another device, skipped it for ever. When the reader was
    // not on their way somewhere specific, send them there once.
    let destination = next;
    if (next === "/") {
      const { data } = await supabase.from("profiles").select("onboarded").single();
      if (data && data.onboarded === false) destination = "/onboarding";
    }
    setBusy(false);
    router.push(destination);
    router.refresh(); // server components re-read the session cookie
  }

  return (
    <AuthCard
      title="Welcome back."
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className={linkClass}>
            Create an account
          </Link>
          .
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {linkProblem && (
          <FormMessage tone="error">
            We could not finish signing you in from that link. This usually means it was opened in a
            different browser from the one you signed up in. Your address is confirmed, so just log
            in below.
          </FormMessage>
        )}
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <Submit busy={busy}>Log in</Submit>
        <p className="text-sm text-muted">
          <Link href="/forgot-password" className={linkClass}>
            Forgot your password?
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
