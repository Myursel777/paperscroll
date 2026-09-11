"use client";

import { FIELDS } from "@/lib/arxiv";
import { topicsForField } from "@/lib/topics";

// Topic chips grouped by field, multi-select. Shared by onboarding and settings.
export function InterestPicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <div className="mt-3 space-y-5">
      {FIELDS.map((f) => (
        <div key={f.id}>
          <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: f.accent }}>
            {f.label}
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {topicsForField(f.id).map((t) => {
              const on = value.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggle(t.id)}
                  aria-pressed={on}
                  title={t.description}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${on ? "" : "border-line text-muted hover:text-ink"}`}
                  style={on ? { background: `${f.accent}22`, color: f.accent, borderColor: f.accent } : undefined}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
