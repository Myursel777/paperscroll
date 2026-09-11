// Shared types and the "fields of study" map.
// Each field maps to one or more real arXiv categories, so a "section"
// in the UI is just a different arXiv query under the hood.

export type Paper = {
  id: string; // arXiv abs URL, used as a stable key
  title: string;
  summary: string;
  authors: string[];
  published: string; // ISO date
  pdfLink: string | null;
  primaryCategory: string | null;
};

export type Field = {
  id: string;
  label: string;
  // arXiv category atoms, joined with OR to build the search query.
  cats: string[];
  accent: string; // hex, themes the card for this field
};

// Tweak / extend these freely. Full category list:
// https://arxiv.org/category_taxonomy
export const FIELDS: Field[] = [
  {
    id: "ai-ml",
    label: "AI & Machine Learning",
    cats: ["cs.AI", "cs.LG", "cs.NE"],
    accent: "#FF4D2E",
  },
  {
    id: "nlp",
    label: "Language & NLP",
    cats: ["cs.CL"],
    accent: "#0E8A6B",
  },
  {
    id: "vision",
    label: "Computer Vision",
    cats: ["cs.CV"],
    accent: "#1E5BFF",
  },
  {
    id: "neuro",
    label: "Neuroscience",
    cats: ["q-bio.NC"],
    accent: "#9A3DE0",
  },
  {
    id: "stats",
    label: "Statistics & ML Theory",
    cats: ["stat.ML", "math.ST"],
    accent: "#C77800",
  },
  {
    id: "robotics",
    label: "Robotics",
    cats: ["cs.RO"],
    accent: "#0AA1C4",
  },
];

export function fieldById(id: string): Field {
  return FIELDS.find((f) => f.id === id) ?? FIELDS[0];
}

// Map an arXiv category (e.g. "cs.CV") back to the Field that owns it.
// Used in the mixed "For You" feed so each card keeps its own colour/label.
export function fieldForCategory(cat: string | null): Field {
  if (!cat) return FIELDS[0];
  return FIELDS.find((f) => f.cats.includes(cat)) ?? FIELDS[0];
}

// arXiv returns Atom XML; this turns one parsed <entry> into a Paper.
// `entry` is loosely typed because the XML shape varies (single vs array).
export function entryToPaper(entry: any): Paper {
  const links = Array.isArray(entry.link)
    ? entry.link
    : entry.link
      ? [entry.link]
      : [];
  const pdf = links.find((l: any) => l?.title === "pdf");

  const authorRaw = entry.author;
  const authors = (Array.isArray(authorRaw) ? authorRaw : [authorRaw])
    .filter(Boolean)
    .map((a: any) => a?.name)
    .filter(Boolean);

  const clean = (s: string | undefined) =>
    (s ?? "").replace(/\s+/g, " ").trim();

  return {
    id: clean(entry.id),
    title: clean(entry.title),
    summary: clean(entry.summary),
    authors,
    published: clean(entry.published),
    pdfLink: pdf?.href ?? null,
    primaryCategory: entry["arxiv:primary_category"]?.term ?? null,
  };
}
