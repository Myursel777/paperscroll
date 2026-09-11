"use client";

import { FIELDS } from "@/lib/arxiv";
import { ChipRow } from "@/components/ChipRow";

export function CategoryBar({
  active,
  onPick,
}: {
  active: string;
  onPick: (id: string) => void;
}) {
  return (
    <ChipRow label="Field of study" activeKey={active}>
      {FIELDS.map((f) => {
        const on = f.id === active;
        return (
          <button
            key={f.id}
            onClick={() => onPick(f.id)}
            aria-pressed={on}
            className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              on ? "text-onAccent" : "border-line text-muted"
            }`}
            style={on ? { background: f.accent, borderColor: f.accent } : undefined}
          >
            {f.label}
          </button>
        );
      })}
    </ChipRow>
  );
}
