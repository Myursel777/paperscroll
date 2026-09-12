// arXiv's daily RSS feeds, used as a fallback by the nightly job.
//
// Why this exists: the search API at export.arxiv.org rate limits by address,
// and a GitHub Actions runner shares its address with everyone else on that
// machine, so a job can be refused with HTTP 429 on its very first request
// through no fault of its own. The RSS feeds are served by a different host
// (rss.arxiv.org) and are not throttled the same way, so when the API refuses
// the job falls back to these.
//
// What they give: the papers announced in the last update, one feed per
// category, with title, abstract, authors, and categories. That is exactly
// what a nightly job wants, with two limits worth knowing:
//   - only the current announcement, so a missed day is a missed day;
//   - nothing at weekends, when arXiv does not announce.
//
// The app itself never uses this: a reader searching or paging needs the
// search API. This is only for the scheduled job.

import { XMLParser } from "fast-xml-parser";
import type { Paper } from "@/lib/arxiv";

export const ARXIV_RSS = "https://rss.arxiv.org/rss";

/** The feed for one arXiv category, for example cs.LG. */
export const rssUrl = (category: string) => `${ARXIV_RSS}/${category}`;

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

/**
 * The versioned arXiv identifier, for example "2609.01234v1".
 *
 * This matters more than it looks. The app keys a paper by its abstract URL
 * everywhere: saved papers, reading events, the store. The search API gives
 * that as `http://arxiv.org/abs/2609.01234v1`, while a feed item's `link` is
 * `https://arxiv.org/abs/2609.01234`, with no version and a different scheme.
 * Taking the link at face value stored the same paper twice, once per source.
 * The identifier with its version is in the guid and again at the start of
 * the description, so it is read from there and the id is rebuilt in exactly
 * the shape the API uses.
 */
export function versionedId(item: { guid?: unknown; description?: unknown; link?: unknown }): string | null {
  const guid = clean(item.guid).match(/oai:arXiv\.org:(\S+)/i);
  if (guid) return guid[1];
  const described = String(item.description ?? "").match(/arXiv:(\S+?)\s/i);
  if (described) return described[1];
  // No identifier anywhere: fall back to whatever the link points at, which
  // leaves the version off but is better than dropping the paper.
  const link = clean(item.link).match(/\/abs\/(\S+)$/);
  return link ? link[1] : null;
}

/**
 * The abstract out of an item's description. arXiv prefixes it with the
 * identifier and the announcement type, on their own lines:
 *
 *   arXiv:2509.01234v1 Announce Type: new
 *   Abstract: The text of the abstract...
 *
 * Both prefixes are stripped when present, and the raw text is used when the
 * format changes, so a feed that stops carrying them still parses.
 */
export function abstractFromDescription(description: string): string {
  const withoutHeader = description.replace(/^\s*arXiv:\S+\s+Announce Type:[^\n]*\n?/i, "");
  return clean(withoutHeader.replace(/^\s*Abstract:\s*/i, ""));
}

/** The published date from an RSS pubDate, or now when it cannot be read. */
function publishedFrom(pubDate: unknown): string {
  const d = new Date(String(pubDate ?? ""));
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/**
 * One feed's items as Papers. `primary` is the category whose feed this is;
 * it is used when an item does not name its own primary category.
 *
 * Items that are revisions rather than new papers are kept: the feed marks
 * them "replace", and a revised paper is still worth showing. Items without a
 * link or title are dropped.
 */
export function parseRssFeed(xml: string, primary: string): Paper[] {
  const data = parser.parse(xml);
  const raw = data?.rss?.channel?.item ?? [];
  const items = Array.isArray(raw) ? raw : [raw];

  return items
    .filter(Boolean)
    .map((item: Record<string, unknown>): Paper => {
      // Rebuilt in the search API's shape so a paper has one id whichever
      // source it came from: abstract pages over http, PDFs over https,
      // which is what arXiv itself returns.
      const ref = versionedId(item);
      const id = ref ? `http://arxiv.org/abs/${ref}` : "";
      const categories = String(
        Array.isArray(item.category) ? item.category.join(",") : (item.category ?? primary),
      )
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      const primaryCategory = categories.includes(primary) ? primary : (categories[0] ?? primary);

      return {
        id,
        title: clean(item.title),
        summary: abstractFromDescription(String(item.description ?? "")),
        authors: clean(item["dc:creator"])
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
        published: publishedFrom(item.pubDate),
        // The feed does not carry a PDF link; it follows from the identifier.
        pdfLink: ref ? `https://arxiv.org/pdf/${ref}` : null,
        primaryCategory,
        // Primary first, no duplicates, as lib/arxiv.ts does for the API.
        categories: Array.from(new Set([primaryCategory, ...categories])),
        tags: [],
      };
    })
    .filter((p) => p.id && p.title);
}
