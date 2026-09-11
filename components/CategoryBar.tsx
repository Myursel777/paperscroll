"use client";

import { FIELDS } from "@/lib/arxiv";

export function CategoryBar({
  active,
  onPick,
}: {
  active: string;
  onPick: (id: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Field of study"
      className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
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
    </div>
  );
}
