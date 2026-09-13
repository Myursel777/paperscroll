"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { InterestPicker } from "@/components/account/InterestPicker";
import { FormMessage, Submit, linkClass } from "@/components/auth/ui";
import { FIELDS } from "@/lib/arxiv";
import { useProfile } from "@/lib/profile";

const MIN_TOPICS = 3;

// First screen after confirming the email: a default field and a few topics,
// so the feed and For You have somewhere to start.
export function OnboardingForm() {
  const router = useRouter();
  const { profile, loading, update } = useProfile();
  const [field, setField] = useState("ai-ml");
  const [interests, setInterests] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setField(profile.default_field);
    setInterests(profile.interests);
  }, [profile]);

  /** Skipping is a choice, so it is remembered; otherwise every login would ask again. */
  async function skip() {
    try {
      await update({ onboarded: true });
    } catch {
      // Not worth blocking the reader over; they can set this in Settings.
    }
    router.push("/");
    router.refresh();
  }

  async function finish() {
    if (interests.length < MIN_TOPICS) return setError(`Pick at least ${MIN_TOPICS} topics so For You has something to go on.`);
    setBusy(true);
    setError(null);
    try {
      await update({ default_field: field, interests, onboarded: true });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl px-6 py-12 sm:py-16">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">Welcome{profile?.display_name ? `, ${profile.display_name}` : ""}</p>
      <h1 className="mt-3 font-display text-4xl font-semibold leading-tight">What do you want to read?</h1>
      <p className="mt-3 max-w-xl text-muted">Choose where the feed should open and a few topics you care about. You can change all of this later in Settings.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void finish();
        }}
        className="mt-10 space-y-10"
      >
        <fieldset disabled={loading}>
          <legend className="font-display text-xl font-semibold">Open the feed on</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {FIELDS.map((f) => {
              const on = f.id === field;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setField(f.id)}
                  aria-pressed={on}
                  className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${on ? "text-onAccent" : "border-line text-muted hover:text-ink"}`}
                  style={on ? { background: f.accent, borderColor: f.accent } : undefined}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset disabled={loading}>
          <legend className="font-display text-xl font-semibold">
            Topics you care about <span className="text-base font-normal text-muted">(at least {MIN_TOPICS}, {interests.length} picked)</span>
          </legend>
          <InterestPicker value={interests} onChange={setInterests} />
        </fieldset>

        {error && <FormMessage tone="error">{error}</FormMessage>}
        <div className="flex flex-wrap items-center gap-6">
          <div className="w-56">
            <Submit busy={busy || loading}>Start reading</Submit>
          </div>
          <button type="button" onClick={() => void skip()} className={linkClass}>
            Skip for now
          </button>
        </div>
      </form>
    </main>
  );
}
