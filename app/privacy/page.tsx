import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { lastUpdated, ownerName } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What PaperScroll stores, and what it does not.",
};

export default function PrivacyPage() {
  return (
    <PageShell title="Privacy">
      <p className="text-sm text-muted">Last updated {lastUpdated}</p>

      <p>
        PaperScroll is run by {ownerName} as a student project. The short version: there are no
        accounts, no analytics, no advertising, and no cookies. This page explains the little that
        does happen.
      </p>

      <h2>What stays in your browser</h2>
      <ul>
        <li>
          <strong>Saved papers.</strong> When you tap Save, the paper is stored in your browser using
          localStorage. It never leaves your device. Clearing your browser data removes it.
        </li>
        <li>
          <strong>Offline cache.</strong> If you install PaperScroll or your browser supports service
          workers, the app shell is cached on your device so it opens quickly. Paper data is not
          cached this way.
        </li>
      </ul>

      <h2>What the server sees</h2>
      <p>
        When you browse a field, your browser asks the PaperScroll server for papers and the server
        asks arXiv. The server keeps a short in-memory count of requests per network address, so
        one device cannot overload the shared connection to arXiv. That count is not written to
        disk and is gone within a minute. Standard hosting logs may record requests for a limited
        time; they are used only to keep the site running.
      </p>

      <h2>Third parties</h2>
      <ul>
        <li>
          <strong>arXiv</strong> provides the papers. Requests to arXiv are made by the PaperScroll
          server, not by your browser, so arXiv does not see your address.
        </li>
        <li>
          <strong>Read paper</strong> and <strong>PDF</strong> links open arXiv directly, where
          arXiv&apos;s own privacy policy applies.
        </li>
        <li>
          If a neural recommender service is configured, the titles and abstracts of papers being
          ranked are sent to it. No personal data is included.
        </li>
      </ul>

      <h2>Your choices</h2>
      <p>
        Everything PaperScroll knows about you is on your device. Remove saved papers from the Saved
        panel, or clear the site&apos;s data in your browser settings, and nothing remains.
      </p>

      <h2>Changes</h2>
      <p>
        If accounts or other features that store data are added, this page will be updated first and
        the date above will change.
      </p>
    </PageShell>
  );
}
