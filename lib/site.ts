// Site-wide constants used by metadata, the sitemap, and the text pages.
//
// siteUrl is used for absolute links in the sitemap and the share preview.
// Set NEXT_PUBLIC_SITE_URL to the real domain in production. Without it,
// Vercel's own VERCEL_URL is used, so a fresh deploy needs no configuration.

export const siteName = "PaperScroll";
export const siteDescription =
  "A scrollable feed of the latest academic papers from arXiv. Free, no account needed.";
export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
).replace(/\/$/, "");
export const ownerName = "Myursel Shahin";
export const repoUrl = "https://github.com/Myursel777/paperscroll";
export const lastUpdated = "11 September 2026";
