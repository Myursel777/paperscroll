import { PageShell } from "@/components/PageShell";

// Shown for any address that does not exist (Next.js convention).
export default function NotFound() {
  return (
    <PageShell title="That page does not exist.">
      <p>
        The address may have a typo, or the page moved. Everything worth reading is on the feed
        anyway.
      </p>
    </PageShell>
  );
}
