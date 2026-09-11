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
    setBusy(false);
    if (err) return setError(friendlyAuthError(err.message));
    router.push(next);
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
        {linkProblem && <FormMessage tone="error">That email link is invalid or has expired. Log in, or request a new one.</FormMessage>}
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
