"use client";

import { useState, type FormEvent } from "react";
import { SignOutButton } from "@/components/account/SignOutButton";
import { Field, FormMessage, Submit } from "@/components/auth/ui";
import { friendlyAuthError } from "@/lib/auth/messages";
import { getSupabaseBrowser } from "@/lib/supabase/client";

export function SecurityForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("password") ?? "");
    if (password.length < 8) return setMessage({ tone: "error", text: "Please choose a password of at least 8 characters." });
    if (password !== String(data.get("confirm") ?? "")) return setMessage({ tone: "error", text: "The two passwords do not match." });

    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setMessage({ tone: "error", text: friendlyAuthError(error.message) });
    form.reset();
    setMessage({ tone: "success", text: "Password changed." });
  }

  return (
    <section className="space-y-12">
      <div>
        <h1 className="font-display text-3xl font-semibold">Security</h1>
        <p className="mt-2 text-muted">Change your password, or sign out of every device.</p>
        <form onSubmit={onSubmit} className="mt-8 max-w-md space-y-5" noValidate>
          <Field label="New password" name="password" type="password" autoComplete="new-password" required minLength={8} hint="At least 8 characters." />
          <Field label="Repeat it" name="confirm" type="password" autoComplete="new-password" required />
          {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
          <Submit busy={busy}>Change password</Submit>
        </form>
      </div>

      <div>
        <h2 className="font-display text-2xl font-semibold">Sessions</h2>
        <p className="mt-2 text-muted">Signs this account out on every browser and phone where it is logged in, including this one.</p>
        <SignOutButton everywhere className="mt-4 rounded-full border border-line px-5 py-2.5 text-sm font-semibold transition active:scale-95" />
      </div>
    </section>
  );
}
