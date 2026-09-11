import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = { title: "Offline" };

// The service worker (public/sw.js) shows this page when a navigation fails
// and the feed itself is not in the cache.
export default function OfflinePage() {
  return (
    <PageShell title="You are offline.">
      <p>
        PaperScroll needs a connection to fetch papers from arXiv. Your saved papers are kept in
        this browser and will still be there when you are back online.
      </p>
      <p>Once the connection returns, go back to the feed and it will load as usual.</p>
    </PageShell>
  );
}
