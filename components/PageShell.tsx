import Link from "next/link";
import type { ReactNode } from "react";

// Frame for the text pages (About, Privacy, Terms, Offline, 404): a way back
// to the feed, a title, and readable body copy. Body styles for h2, p, ul,
// and links come from the `.text-page` rules in globals.css.
export function PageShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-6 py-12 sm:py-16">
      <Link href="/" className="text-sm font-medium text-muted underline-offset-4 hover:text-ink hover:underline">
        Back to the feed
      </Link>
      <h1 className="mt-8 font-display text-4xl font-semibold leading-tight sm:text-5xl">{title}</h1>
      <div className="text-page mt-8">{children}</div>
    </main>
  );
}
