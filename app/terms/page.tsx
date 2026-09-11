import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { lastUpdated, ownerName, repoUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The plain-language terms for using PaperScroll.",
};

export default function TermsPage() {
  return (
    <PageShell title="Terms of use">
      <p className="text-sm text-muted">Last updated {lastUpdated}</p>

      <p>
        PaperScroll is a free, non-commercial student project by {ownerName}. By using it you agree
        to the few points below.
      </p>

      <h2>The service</h2>
      <ul>
        <li>
          PaperScroll is provided as is, without any warranty. It may be unavailable, change, or stop
          at any time.
        </li>
        <li>
          Papers are fetched live from arXiv. PaperScroll does not check, edit, or endorse their
          content and is not responsible for it.
        </li>
        <li>
          Please use the site as a reader would. Automated scraping through PaperScroll is not
          allowed; the arXiv API is public and the right place for that.
        </li>
      </ul>

      <h2>Content and rights</h2>
      <ul>
        <li>
          Paper titles, abstracts, and PDFs belong to their authors and are shown under arXiv&apos;s
          terms. PaperScroll only links to them.
        </li>
        <li>
          The PaperScroll source code is open under the MIT licence at{" "}
          <a href={repoUrl} target="_blank" rel="noreferrer">
            {repoUrl.replace("https://", "")}
          </a>
          .
        </li>
        <li>The PaperScroll name and design may not be used to present another site as this one.</li>
      </ul>

      <h2>Liability</h2>
      <p>
        To the extent the law allows, {ownerName} is not liable for any loss arising from the use of
        PaperScroll or from the content of papers reached through it.
      </p>

      <h2>Changes</h2>
      <p>These terms may change as the project grows. The date above shows the current version.</p>
    </PageShell>
  );
}
