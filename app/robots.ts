import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// Served at /robots.txt. Crawlers may index the pages but not the API.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/offline"] },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
