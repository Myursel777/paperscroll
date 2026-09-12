"use client";

import { useMemo, useState } from "react";
import { FormMessage } from "@/components/auth/ui";
import { useProfile } from "@/lib/profile";
import { useReading } from "@/lib/foryou/useReading";
import { FIELDS } from "@/lib/arxiv";
import { TOPICS, topicById, topicsForField } from "@/lib/topics";

// The For You controls: what the recommender has learned, sliders to correct
// it, and a way to wipe the history.
//
// The sliders are the honest version of "show me more of this": a value of 1
// is neutral, 2 doubles a topic's weight, 0 turns it off. The maths is in
// lib/foryou/profile.ts, so what this page shows is exactly what the feed
// uses.

const STEPS = [0, 0.5, 1, 1.5, 2];
const STEP_LABEL: Record<number, string> = { 0: "Never", 0.5: "Less", 1: "Normal", 1.5: "More", 2: "Much more" };

export function ForYouPanel() {
  const { profile, update } = useProfile();
  // The updater has to be passed in: with an account the sliders live in the
  // profile row, and without it they would be written to the browser and then
  // ignored in favour of the row.
  const reading = useReading({ account: profile, updateAccount: update });
  const [adding, setAdding] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Topics worth showing: everything the reader has read about or picked,
  // plus anything they have already tuned.
  const tuned = useMemo(() => {
    const ids = new Set<string>([
      ...reading.profile.top.slice(0, 12).map((t) => t.id),
      ...(profile?.interests ?? []),
      ...Object.keys(reading.boosts),
    ]);
    return [...ids]
      .map((id) => topicById(id))
      .filter((t) => t !== undefined)
      .sort((a, b) => (reading.profile.weights[b.id] ?? 0) - (reading.profile.weights[a.id] ?? 0));
  }, [reading.profile, reading.boosts, profile]);

  const untuned = TOPICS.filter((t) => !tuned.some((x) => x.id === t.id));

  async function clearHistory() {
    await reading.clearHistory();
    setConfirming(false);
    setMessage("Reading history cleared. For You starts from your interests again.");
  }

  return (
    <section className="space-y-12">
      <div>
        <h1 className="font-display text-3xl font-semibold">For You</h1>
        <p className="mt-2 text-muted">
          The feed learns from what you open, read, save, and hide. Nothing else is recorded: no
          identity beyond your account, no tracking across other sites.
        </p>
      </div>

      <div>
        <h2 className="font-display text-2xl font-semibold">What it has learned</h2>
        {reading.profile.top.length === 0 ? (
          <p className="mt-2 text-muted">
            Nothing yet. Read a few papers, or pick interests in Settings, and this fills in.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted">
              Strongest topics first, from {reading.events.length} recent actions. Older ones count
              for less: after a month, half as much.
            </p>
            <ul className="mt-4 space-y-2">
              {reading.profile.top.slice(0, 8).map((t) => {
                const topic = topicById(t.id);
                const field = FIELDS.find((f) => f.id === topic?.field);
                const share = t.weight / reading.profile.top[0].weight;
                return (
                  <li key={t.id} className="flex items-center gap-3">
                    <span className="w-48 shrink-0 truncate text-sm">{topic?.label ?? t.id}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${Math.round(share * 100)}%`, background: field?.accent ?? "#6B6358" }}
                      />
                    </span>
                    {reading.profile.fromInterests.has(t.id) && (
                      <span className="shrink-0 text-xs text-muted">from your interests</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      <div>
        <h2 className="font-display text-2xl font-semibold">Turn topics up or down</h2>
        <p className="mt-2 text-sm text-muted">
          These sliders multiply a topic&apos;s weight. Normal leaves it to the reading history.
        </p>

        <ul className="mt-5 space-y-5">
          {tuned.map((t) => {
            const value = reading.boosts[t.id] ?? 1;
            return (
              <li key={t.id}>
                <label htmlFor={`boost-${t.id}`} className="block text-sm font-medium">
                  {t.label}
                  <span className="ml-2 font-normal text-muted">{STEP_LABEL[value] ?? "Normal"}</span>
                </label>
                <input
                  id={`boost-${t.id}`}
                  type="range"
                  min={0}
                  max={2}
                  step={0.5}
                  value={value}
                  list="foryou-steps"
                  onChange={(e) => reading.setBoost(t.id, Number(e.target.value))}
                  className="mt-1.5 w-full max-w-md accent-ink"
                />
              </li>
            );
          })}
        </ul>
        <datalist id="foryou-steps">
          {STEPS.map((v) => (
            <option key={v} value={v} label={STEP_LABEL[v]} />
          ))}
        </datalist>

        <div className="mt-6 flex flex-wrap items-end gap-3">
          <label htmlFor="add-topic" className="block text-sm">
            <span className="font-medium">Add a topic to tune</span>
            <select
              id="add-topic"
              value={adding}
              onChange={(e) => {
                const id = e.target.value;
                setAdding("");
                if (id) reading.setBoost(id, 1.5);
              }}
              className="mt-1.5 block w-full max-w-xs rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
            >
              <option value="">Choose a topic…</option>
              {FIELDS.map((f) => (
                <optgroup key={f.id} label={f.label}>
                  {topicsForField(f.id)
                    .filter((t) => untuned.some((u) => u.id === t.id))
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          {Object.keys(reading.boosts).length > 0 && (
            <button
              onClick={reading.resetBoosts}
              className="rounded-full border border-line px-4 py-2 text-sm font-medium transition active:scale-95"
            >
              Reset the sliders
            </button>
          )}
        </div>
      </div>

      <div>
        <h2 className="font-display text-2xl font-semibold">Reading history</h2>
        <p className="mt-2 text-muted">
          {reading.events.length} actions from the last two months. Clearing them makes For You
          forget what you have read; your saved papers and interests stay.
        </p>
        {message && (
          <div className="mt-4 max-w-md">
            <FormMessage tone="success">{message}</FormMessage>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          {confirming ? (
            <>
              <button
                onClick={() => void clearHistory()}
                className="rounded-full bg-[#FF4D2E] px-5 py-2.5 text-sm font-semibold text-onAccent transition active:scale-95"
              >
                Yes, clear it
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold transition active:scale-95"
              >
                Keep it
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                setMessage(null);
                setConfirming(true);
              }}
              className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold transition active:scale-95"
            >
              Clear reading history
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
