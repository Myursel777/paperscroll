// Site-wide constants used by metadata, the sitemap, and the text pages.
//
// siteUrl is the absolute address of the deployed site. It feeds the sitemap,
// robots.txt, and the share preview, and the root layout hands it to Next as
// `metadataBase`, which parses it with `new URL`. That parse is why the
// resolution below is careful: a value Next cannot parse throws during the
// build, and because every page renders inside the root layout the failure
// surfaces as "Failed to collect page data" on whichever page Next reached
// first, with nothing pointing at the real cause. A deploy where the address
// was pasted without https, or where the variable was left in place but
// empty, used to fail exactly that way.
//
// Resolution order:
//   1. NEXT_PUBLIC_SITE_URL, the real address once there is one;
//   2. VERCEL_URL, which Vercel sets per deployment and always without a
//      scheme, so a fresh deploy needs no configuration at all;
//   3. localhost, for development.
// Anything blank or unparseable is skipped rather than trusted.

const DEV_URL = "http://localhost:3000";

/**
 * A value turned into an absolute address, or null when it cannot be one.
 * A missing scheme is filled in as https, trailing slashes are dropped, and a
 * blank value counts as unset. A path is preserved, so a site served under a
 * subpath keeps it.
 */
export function normaliseSiteUrl(value: string | undefined | null): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  // The scheme goes on before anything is trimmed off the end, or a bare
  // "https://" loses its slashes and is then mistaken for a hostname.
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    // A scheme with no host parses in some runtimes, so the host is checked too.
    if (!new URL(withScheme).hostname) return null;
  } catch {
    return null;
  }
  return withScheme.replace(/\/+$/, "");
}

export const siteName = "PaperScroll";
export const siteDescription =
  "A scrollable feed of the latest academic papers from arXiv. Free, no account needed.";
export const siteUrl =
  normaliseSiteUrl(process.env.NEXT_PUBLIC_SITE_URL) ??
  normaliseSiteUrl(process.env.VERCEL_URL) ??
  DEV_URL;
export const ownerName = "Myursel Shahin";
export const repoUrl = "https://github.com/Myursel777/paperscroll";
export const lastUpdated = "11 September 2026";
