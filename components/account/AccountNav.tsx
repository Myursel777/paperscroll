"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS: [string, string][] = [
  ["/account", "Profile"],
  ["/account/settings", "Settings"],
  ["/account/foryou", "For You"],
  ["/account/security", "Security"],
  ["/account/data", "Your data"],
  ["/saved", "Library"],
];

export function AccountNav() {
  const path = usePathname();
  return (
    <nav aria-label="Account">
      <ul className="flex flex-wrap gap-2 sm:flex-col sm:gap-1">
        {ITEMS.map(([href, label]) => {
          const on = path === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={on ? "page" : undefined}
                className={`block rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  on ? "bg-ink text-paper" : "text-muted hover:text-ink"
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
