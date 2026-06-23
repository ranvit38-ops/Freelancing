import { describe, it, expect } from "vitest";
import { themeToCssVars } from "@/lib/theme";
import type { SiteConfig } from "@/lib/site-config.schema";

const theme: SiteConfig["theme"] = {
  colors: {
    brand: "37 99 235",
    brandFg: "255 255 255",
    brandAccent: "14 165 233",
    bg: "255 255 255",
    surface: "248 250 252",
    fg: "15 23 42",
    muted: "100 116 139",
    border: "226 232 240",
  },
  fonts: { sans: "Inter", heading: "Inter" },
  radius: "0.625rem",
};

describe("themeToCssVars", () => {
  const vars = themeToCssVars(theme);

  it("maps brand color channels onto --brand", () => {
    expect(vars["--brand"]).toBe("37 99 235");
    expect(vars["--brand-fg"]).toBe("255 255 255");
  });

  it("maps fonts and radius", () => {
    expect(vars["--font-sans"]).toBe("Inter");
    expect(vars["--radius"]).toBe("0.625rem");
  });

  it("emits every expected variable", () => {
    const keys = Object.keys(vars).sort();
    expect(keys).toEqual(
      [
        "--bg",
        "--border",
        "--brand",
        "--brand-accent",
        "--brand-fg",
        "--font-heading",
        "--font-sans",
        "--fg",
        "--muted",
        "--radius",
        "--surface",
      ].sort()
    );
  });
});
