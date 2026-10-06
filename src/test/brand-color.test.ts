import { describe, expect, it } from "vitest";
import { brandColor, displayBrandColor } from "@/lib/brand-color";
describe("display-only brand color", () => {
  it("shares a semantic token for legacy brand values", () => {
    for (const value of [null, undefined, "", "#7ED321", "#7DD520", "#548E15"]) expect(displayBrandColor(value)).toBe(brandColor);
  });
  it("preserves functional and custom colors", () => {
    for (const value of ["#16a34a", "#F59E0B", "#dc2626", "#25D366"]) expect(displayBrandColor(value)).toBe(value);
  });
});
