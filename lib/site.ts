// Site-wide constants used by metadata, the sitemap, and the text pages.
// Set NEXT_PUBLIC_SITE_URL in production (for example on Vercel) so absolute
// links in the sitemap and the Open Graph image point at the real domain.

export const siteName = "PaperScroll";
export const siteDescription =
  "A scrollable feed of the latest academic papers from arXiv. Free, no account needed.";
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const ownerName = "Myursel Shahin";
export const repoUrl = "https://github.com/Myursel777/paperscroll";
export const lastUpdated = "11 September 2026";
