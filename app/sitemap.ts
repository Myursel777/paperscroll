import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// Served at /sitemap.xml. Only the public text pages and the feed; the API
// and the offline page are not for search engines.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return ["", "/about", "/privacy", "/terms"].map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified,
  }));
}
