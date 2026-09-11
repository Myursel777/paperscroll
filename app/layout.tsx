import type { Metadata, Viewport } from "next";
import { RegisterSW } from "@/components/RegisterSW";
import { siteDescription, siteName, siteUrl } from "@/lib/site";
import "./globals.css";

// Icons come from app/icon.png and app/apple-icon.png automatically, and the
// share preview from app/opengraph-image.tsx. metadataBase makes those URLs
// absolute in the generated tags.
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "PaperScroll — research, one swipe at a time",
    template: "%s · PaperScroll",
  },
  description: siteDescription,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: siteName },
  openGraph: {
    type: "website",
    siteName,
    title: "PaperScroll — research, one swipe at a time",
    description: siteDescription,
    url: siteUrl,
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#FBF8F1",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Fonts via link so the project runs with zero font setup. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
