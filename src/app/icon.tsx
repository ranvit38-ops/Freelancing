import { ImageResponse } from "next/og";
import site from "@/site.config";

/**
 * Dynamically generated favicon built from the brand color + company initial
 * in site.config.ts, so it re-skins automatically. Replace with a static
 * src/app/icon.png if a client provides a designed favicon.
 */
export const runtime = "edge";
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  const brand = `rgb(${site.theme.colors.brand})`;
  const brandFg = `rgb(${site.theme.colors.brandFg})`;
  const initial = site.company.name.trim().charAt(0).toUpperCase() || "•";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: brand,
          color: brandFg,
          fontSize: 40,
          fontWeight: 800,
          borderRadius: 12,
          fontFamily: "sans-serif",
        }}
      >
        {initial}
      </div>
    ),
    { ...size }
  );
}
