// Shared helpers for unit tests.
import type { Paper } from "@/lib/arxiv";

/** A minimal Atom feed like the one arXiv returns, with one entry per id. */
export function atomFeed(ids: string[], category = "cs.AI") {
  const entries = ids
    .map(
      (id) => `
      <entry>
        <id>http://arxiv.org/abs/${id}</id>
        <title>Paper ${id}</title>
        <summary>Abstract of paper ${id}.</summary>
        <published>2026-09-10T00:00:00Z</published>
        <author><name>Author ${id}</name></author>
        <link title="pdf" href="http://arxiv.org/pdf/${id}" rel="related" type="application/pdf"/>
        <arxiv:primary_category xmlns:arxiv="http://arxiv.org/schemas/atom" term="${category}"/>
        <category term="${category}"/>
        <category term="cs.LG"/>
      </entry>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>ArXiv Query</title>${entries}
    </feed>`;
}

export function paper(over: Partial<Paper> & { id: string }): Paper {
  return {
    title: `Paper ${over.id}`,
    summary: "",
    authors: ["Someone"],
    published: "2026-09-10T00:00:00Z",
    pdfLink: null,
    primaryCategory: "cs.AI",
    categories: ["cs.AI"],
    tags: [],
    ...over,
  };
}
