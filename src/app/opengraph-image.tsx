import { ImageResponse } from "next/og";
import site from "@/site.config";

/**
 * Dynamically generated Open Graph image (1200×630 PNG) built from the brand
 * colors and company name in site.config.ts. Re-skins automatically — no need
 * to hand-design a social card per client (though you can via seo.ogImage).
 */
export const runtime = "edge";
export const alt = site.seo.defaultTitle;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const brand = `rgb(${site.theme.colors.brand})`;
  const brandFg = `rgb(${site.theme.colors.brandFg})`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: brand,
          color: brandFg,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.1 }}>{site.company.name}</div>
        <div style={{ marginTop: 24, fontSize: 34, opacity: 0.9, maxWidth: 900 }}>
          {site.company.tagline}
        </div>
      </div>
    ),
    { ...size }
  );
}
