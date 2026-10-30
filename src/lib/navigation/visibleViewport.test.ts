import { afterEach, describe, expect, it, vi } from "vitest";
import { startVisibleViewport } from "./visibleViewport";

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ""; document.documentElement.removeAttribute("data-keyboard-open"); });
describe("visible mobile viewport", () => {
  it("tracks the keyboard-reduced area and clears it when restored", () => {
    const viewport = Object.assign(new EventTarget(), { height: 400, offsetTop: 20, scale: 1 });
    vi.stubGlobal("visualViewport", viewport);
    vi.stubGlobal("innerHeight", 800);
    const input = document.createElement("input"); document.body.append(input); input.focus();
    const stop = startVisibleViewport();
    expect(document.documentElement.style.getPropertyValue("--visible-height")).toBe("400px");
    expect(document.documentElement.style.getPropertyValue("--visible-bottom")).toBe("380px");
    expect(document.documentElement.hasAttribute("data-keyboard-open")).toBe(true);
    viewport.height = 800; viewport.offsetTop = 0; viewport.dispatchEvent(new Event("resize"));
    expect(document.documentElement.hasAttribute("data-keyboard-open")).toBe(false);
    stop();
  });
  it("does not reposition controls while pinch-zooming", () => {
    const viewport = Object.assign(new EventTarget(), { height: 700, offsetTop: 0, scale: 1 });
    vi.stubGlobal("visualViewport", viewport);
    const stop = startVisibleViewport();
    viewport.scale = 2; viewport.height = 350; viewport.dispatchEvent(new Event("resize"));
    expect(document.documentElement.style.getPropertyValue("--visible-height")).toBe("700px");
    stop();
  });
});