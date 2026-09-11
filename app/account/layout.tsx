import type { Metadata } from "next";
import Link from "next/link";
import { AccountNav } from "@/components/account/AccountNav";
import { SignOutButton } from "@/components/account/SignOutButton";

export const metadata: Metadata = { title: { default: "Account", template: "%s · Account · PaperScroll" } };

// Frame for the account pages: a small section menu on the left (or on top on
// phones), the page on the right. middleware.ts only lets signed-in users
// this far.
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-4xl px-6 py-12 sm:py-16">
      <Link href="/" className="text-sm font-medium text-muted underline-offset-4 hover:text-ink hover:underline">
        Back to the feed
      </Link>
      <div className="mt-8 grid gap-10 sm:grid-cols-[180px_1fr]">
        <aside className="flex flex-col gap-6">
          <AccountNav />
          <SignOutButton className="w-fit text-sm font-medium text-muted underline-offset-4 hover:text-ink hover:underline" />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </main>
  );
}
