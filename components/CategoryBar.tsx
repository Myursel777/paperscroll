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
    <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {FIELDS.map((f) => {
        const on = f.id === active;
        return (
          <button
            key={f.id}
            onClick={() => onPick(f.id)}
            className="whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium transition"
            style={
              on
                ? { background: f.accent, color: "#FBF8F1", borderColor: f.accent }
                : { borderColor: "#E7E0D4", color: "#6B6358" }
            }
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
