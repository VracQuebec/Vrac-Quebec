import { describe, it, expect } from "vitest";
import { detectDevice } from "@/hooks/useInstallApp";

describe("détection de l'appareil pour l'installation", () => {
  it("reconnaît l'iPhone", () => {
    expect(detectDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari")).toBe("ios");
  });
  it("reconnaît l'iPad moderne (UA de Mac + tactile)", () => {
    expect(detectDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari", 5)).toBe("ios");
  });
  it("reconnaît Android", () => {
    expect(detectDevice("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome")).toBe("android");
  });
  it("classe l'ordinateur comme desktop", () => {
    expect(detectDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome", 0)).toBe("desktop");
    expect(detectDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome")).toBe("desktop");
  });
});
