import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard, linkClass } from "@/components/auth/ui";

export const metadata: Metadata = { title: "Confirm your email" };

// Linked from places that need a confirmed address. The sign-up form shows
// the same message inline right after signing up.
export default function VerifyEmailPage() {
  return (
    <AuthCard
      title="Confirm your email."
      lead="We sent you a link when you signed up. Open it on this device and you are in. The link is valid for 24 hours."
    >
      <p className="text-sm text-muted">
        Cannot find it? Check the spam folder, or{" "}
        <Link href="/signup" className={linkClass}>
          sign up again
        </Link>{" "}
        with the same address to get a new one.
      </p>
    </AuthCard>
  );
}
