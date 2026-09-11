"use client";

import Link from "next/link";
import type { InputHTMLAttributes, ReactNode } from "react";

// Small form kit shared by the sign-in and account pages so they all look
// like one product: a centred card, labelled fields, one primary button, and
// messages that screen readers announce.

export function AuthCard({
  title,
  lead,
  children,
  footer,
}: {
  title: string;
  lead?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
      <Link href="/" className="text-sm font-medium text-muted underline-offset-4 hover:text-ink hover:underline">
        Back to the feed
      </Link>
      <h1 className="mt-8 font-display text-4xl font-semibold leading-tight">{title}</h1>
      {lead && <p className="mt-3 text-base leading-relaxed text-muted">{lead}</p>}
      <div className="mt-8">{children}</div>
      {footer && <p className="mt-8 text-sm text-muted">{footer}</p>}
    </main>
  );
}

export function Field({
  label,
  hint,
  ...props
}: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = props.id ?? props.name;
  return (
    <label htmlFor={id} className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        id={id}
        {...props}
        className="mt-1.5 w-full rounded-xl border border-line bg-paper px-4 py-2.5 text-base outline-none transition focus:border-ink"
      />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Submit({ children, busy }: { children: ReactNode; busy?: boolean }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="w-full rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper transition active:scale-[0.99] disabled:opacity-60"
    >
      {busy ? "One moment…" : children}
    </button>
  );
}

export function FormMessage({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-xl px-4 py-3 text-sm ${
        tone === "error" ? "bg-[#FF4D2E1A] text-ink" : "bg-[#0E8A6B1A] text-ink"
      }`}
    >
      {children}
    </p>
  );
}

export const linkClass = "font-medium text-ink underline underline-offset-4";
