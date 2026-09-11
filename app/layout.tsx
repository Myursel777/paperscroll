import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { RegisterSW } from "@/components/RegisterSW";
import { siteDescription, siteName, siteUrl } from "@/lib/site";
import "./globals.css";

// Fonts are downloaded once at build time and served from this site, so
// there is no request to Google at runtime, no render-blocking stylesheet,
// and no layout shift. Tailwind reads them through the two CSS variables
// (see tailwind.config.ts).
const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-fraunces",
  display: "swap",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

// Icons come from app/icon.png and app/apple-icon.png automatically, and the
// share preview from app/opengraph-image.tsx. metadataBase makes those URLs
// absolute in the generated tags.
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "PaperScroll: research, one swipe at a time",
    template: "%s · PaperScroll",
  },
  description: siteDescription,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: siteName },
  openGraph: {
    type: "website",
    siteName,
    title: "PaperScroll: research, one swipe at a time",
    description: siteDescription,
    url: siteUrl,
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBF8F1" },
    { media: "(prefers-color-scheme: dark)", color: "#16130F" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
