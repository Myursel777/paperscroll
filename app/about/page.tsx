import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { ownerName, repoUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "About PaperScroll",
  description: "What PaperScroll is, who made it, and how it works.",
};

export default function AboutPage() {
  return (
    <PageShell title="Reading research should feel as light as scrolling a feed.">
      <p>
        PaperScroll is a vertical, swipe-through feed of academic papers. Pick a field, scroll one
        paper at a time, save what looks interesting, and let the For You feed learn what you like.
        Papers come live from the public arXiv API; nothing is rehosted, every card links to the
        original abstract and PDF.
      </p>

      <h2>Who made it</h2>
      <p>
        PaperScroll is an independent student project by {ownerName}. It is free, has no ads, needs
        no account, and its source code is open under the MIT licence on{" "}
        <a href={repoUrl} target="_blank" rel="noreferrer">
          GitHub
        </a>
        .
      </p>

      <h2>How it works</h2>
      <ul>
        <li>
          A field of study is just an arXiv query. Each field maps to one or more arXiv categories,
          for example Computer Vision is <code>cs.CV</code>.
        </li>
        <li>
          Requests go through a small server that is deliberately gentle with arXiv: one request at
          a time, results cached for ten minutes, and a pause whenever arXiv asks for one.
        </li>
        <li>
          For You blends five things: how close a paper is to the ones you responded to, how well
          its topics match what you read, how new it is, how many other readers opened it, and
          whether you have already seen it. Every few cards it deliberately shows something
          outside your usual topics, and each card says in one line why it is there.
        </li>
        <li>
          Similarity comes from a word-based TF-IDF model that runs in your browser, or from
          sentence embeddings computed by a nightly job when one is configured. Your reading
          history stays in your browser unless you have an account, in which case it syncs so the
          feed follows you between devices.
        </li>
        <li>
          Saved papers live in your browser. With an optional account they also sync across
          your devices. There is no tracking either way.
        </li>
      </ul>

      <h2>Credits</h2>
      <p>
        Thank you to arXiv for use of its open access interoperability. Paper content belongs to
        its authors.
      </p>
    </PageShell>
  );
}
