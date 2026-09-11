"use client";

import { useState, type FormEvent } from "react";
import { Field, FormMessage, Submit } from "@/components/auth/ui";
import { useUser } from "@/lib/auth/useUser";
import { useProfile } from "@/lib/profile";

export function ProfileForm() {
  const { user } = useUser();
  const { profile, loading, update } = useProfile();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("display_name") ?? "").trim();
    setBusy(true);
    setMessage(null);
    try {
      await update({ display_name: name || null });
      setMessage({ tone: "success", text: "Saved." });
    } catch (err) {
      setMessage({ tone: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h1 className="font-display text-3xl font-semibold">Profile</h1>
      <p className="mt-2 text-muted">How the site greets you.</p>

      {/* The key remounts the form once the profile has loaded so the default value shows. */}
      <form key={profile ? "loaded" : "loading"} onSubmit={onSubmit} className="mt-8 max-w-md space-y-5" noValidate>
        <Field label="Name" name="display_name" defaultValue={profile?.display_name ?? ""} maxLength={60} disabled={loading} autoComplete="name" />
        <Field label="Email" name="email" type="email" value={user?.email ?? ""} readOnly hint="Changing the email address is not supported yet." />
        {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
        <Submit busy={busy || loading}>Save</Submit>
      </form>
    </section>
  );
}
