import { ImageResponse } from "next/og";
import { siteDescription } from "@/lib/site";

// The preview card shown when a link to PaperScroll is shared, drawn from
// this JSX (Next.js convention: app/opengraph-image.tsx). Only flexbox layout
// is supported by the renderer, hence the explicit display: flex everywhere.
//
// It is rendered in the edge runtime on request rather than at build time:
// the build-time renderer fails on Windows paths, and the host caches the
// response anyway.
export const runtime = "edge";

export const alt = "PaperScroll: research, one swipe at a time";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: "#FBF8F1",
          color: "#16130F",
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div
            style={{
              width: 104,
              height: 104,
              borderRadius: 28,
              background: "#FF4D2E",
              color: "#FBF8F1",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 72,
              fontWeight: 700,
            }}
          >
            P
          </div>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 700 }}>
            Paper<span style={{ color: "#FF4D2E" }}>Scroll</span>
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 52, lineHeight: 1.15, maxWidth: 960 }}>
          Research, one swipe at a time.
        </div>

        <div style={{ display: "flex", fontSize: 30, color: "#6B6358" }}>{siteDescription}</div>
      </div>
    ),
    size,
  );
}
