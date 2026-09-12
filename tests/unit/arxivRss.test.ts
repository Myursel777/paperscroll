import { describe, expect, it } from "vitest";
import { abstractFromDescription, parseRssFeed, rssUrl } from "@/lib/arxivRss";

// A feed shaped like the ones arXiv serves at rss.arxiv.org: an announcement
// of new papers, one with two categories and a revision ("replace") item.
const FEED = `<?xml version='1.0' encoding='UTF-8'?>
<rss xmlns:arxiv="http://arxiv.org/schemas/atom" xmlns:dc="http://purl.org/dc/elements/1.1/" version="2.0">
  <channel>
    <title>cs.LG updates on arXiv.org</title>
    <item>
      <title>Scaling Laws for Sparse Mixtures</title>
      <link>http://arxiv.org/abs/2609.01234</link>
      <description>arXiv:2609.01234v1 Announce Type: new
Abstract: We study how sparse mixture-of-experts models scale with compute.</description>
      <dc:creator>Ada Lovelace, Alan Turing</dc:creator>
      <category>cs.LG</category>
      <category>cs.AI</category>
      <pubDate>Fri, 11 Sep 2026 00:00:00 -0400</pubDate>
      <arxiv:announce_type>new</arxiv:announce_type>
    </item>
    <item>
      <title>A Revised Study of Optimisers</title>
      <link>http://arxiv.org/abs/2608.09876</link>
      <description>arXiv:2608.09876v2 Announce Type: replace
Abstract: Revised comparison of optimisers.</description>
      <dc:creator>Grace Hopper</dc:creator>
      <category>cs.LG</category>
      <pubDate>Fri, 11 Sep 2026 00:00:00 -0400</pubDate>
      <arxiv:announce_type>replace</arxiv:announce_type>
    </item>
  </channel>
</rss>`;

const EMPTY = `<?xml version='1.0' encoding='UTF-8'?>
<rss version="2.0"><channel><title>cs.LG updates on arXiv.org</title></channel></rss>`;

const ONE_ITEM = `<?xml version='1.0' encoding='UTF-8'?>
<rss xmlns:dc="http://purl.org/dc/elements/1.1/" version="2.0">
  <channel><item>
    <title>Only Paper</title>
    <link>http://arxiv.org/abs/2609.00001</link>
    <description>Just the abstract, with no header at all.</description>
    <dc:creator>Solo Author</dc:creator>
    <category>q-bio.NC</category>
  </item></channel>
</rss>`;

describe("rssUrl", () => {
  it("points at the feed for a category", () => {
    expect(rssUrl("cs.LG")).toBe("https://rss.arxiv.org/rss/cs.LG");
  });
});

describe("abstractFromDescription", () => {
  it("strips the identifier line and the Abstract label", () => {
    expect(abstractFromDescription("arXiv:2609.01234v1 Announce Type: new\nAbstract: The text.")).toBe("The text.");
  });

  it("keeps the text when the prefixes are missing", () => {
    expect(abstractFromDescription("The text on its own.")).toBe("The text on its own.");
  });

  it("collapses the line breaks arXiv wraps abstracts with", () => {
    expect(abstractFromDescription("Abstract: One line\n  and the next.")).toBe("One line and the next.");
  });
});

describe("parseRssFeed", () => {
  const papers = parseRssFeed(FEED, "cs.LG");

  it("reads every item", () => {
    expect(papers).toHaveLength(2);
  });

  it("uses the abstract page as the id, over https", () => {
    expect(papers[0].id).toBe("https://arxiv.org/abs/2609.01234");
    expect(papers[0].pdfLink).toBe("https://arxiv.org/pdf/2609.01234");
  });

  it("reads the title, abstract, and authors", () => {
    expect(papers[0].title).toBe("Scaling Laws for Sparse Mixtures");
    expect(papers[0].summary).toBe("We study how sparse mixture-of-experts models scale with compute.");
    expect(papers[0].authors).toEqual(["Ada Lovelace", "Alan Turing"]);
  });

  it("keeps every category with the feed's own first", () => {
    expect(papers[0].primaryCategory).toBe("cs.LG");
    expect(papers[0].categories).toEqual(["cs.LG", "cs.AI"]);
  });

  it("reads the announcement date", () => {
    expect(papers[0].published.slice(0, 10)).toBe("2026-09-11");
  });

  it("leaves tags empty for the tagger to fill in", () => {
    expect(papers[0].tags).toEqual([]);
  });

  it("keeps revisions, which are still worth showing", () => {
    expect(papers[1].id).toBe("https://arxiv.org/abs/2608.09876");
  });

  it("returns nothing for a feed with no items, as at weekends", () => {
    expect(parseRssFeed(EMPTY, "cs.LG")).toEqual([]);
  });

  it("handles a single item, which the XML parser gives as an object", () => {
    const one = parseRssFeed(ONE_ITEM, "q-bio.NC");
    expect(one).toHaveLength(1);
    expect(one[0].title).toBe("Only Paper");
    expect(one[0].summary).toBe("Just the abstract, with no header at all.");
    expect(one[0].primaryCategory).toBe("q-bio.NC");
  });
});
