"use client";

import { useEffect, useState } from "react";
import { FormMessage, Submit } from "@/components/auth/ui";
import { InterestPicker } from "@/components/account/InterestPicker";
import { FIELDS } from "@/lib/arxiv";
import { useProfile } from "@/lib/profile";

// Default field (the feed opens on it) and interests (topics used by For You
// before there is enough reading history).
export function SettingsForm() {
  const { profile, loading, update } = useProfile();
  const [field, setField] = useState("ai-ml");
  const [interests, setInterests] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!profile) return;
    setField(profile.default_field);
    setInterests(profile.interests);
  }, [profile]);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await update({ default_field: field, interests });
      setMessage({ tone: "success", text: "Saved." });
    } catch (err) {
      setMessage({ tone: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h1 className="font-display text-3xl font-semibold">Settings</h1>
      <p className="mt-2 text-muted">Where the feed opens, and what you care about.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="mt-8 space-y-8"
      >
        <fieldset disabled={loading}>
          <legend className="text-sm font-medium">Default field</legend>
          <div className="mt-2 flex flex-wrap gap-2">
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
          <legend className="text-sm font-medium">Interests</legend>
          <p className="mt-1 text-sm text-muted">Pick as many as you like. For You starts from these until it has learned from what you read.</p>
          <InterestPicker value={interests} onChange={setInterests} />
        </fieldset>

        {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
        <div className="max-w-xs">
          <Submit busy={busy || loading}>Save settings</Submit>
        </div>
      </form>
    </section>
  );
}
