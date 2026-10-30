/** Geometry only: no storage, session, location, or telemetry access. */
export function startVisibleViewport() {
  const root = document.documentElement;
  const viewport = window.visualViewport;
  const update = () => {
    // Pinch zoom must not resize controls under the user's fingers.
    if (viewport && viewport.scale !== 1) return;
    const height = viewport?.height ?? window.innerHeight;
    const top = viewport?.offsetTop ?? 0;
    root.style.setProperty("--visible-height", `${height}px`);
    root.style.setProperty("--visible-top", `${top}px`);
    root.style.setProperty("--visible-bottom", `${Math.max(0, window.innerHeight - height - top)}px`);
    root.toggleAttribute("data-keyboard-open", window.innerHeight - height > 150 && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? ""));
  };
  update();
  viewport?.addEventListener("resize", update);
  viewport?.addEventListener("scroll", update);
  window.addEventListener("resize", update);
  document.addEventListener("focusin", update);
  document.addEventListener("focusout", update);
  return () => {
    viewport?.removeEventListener("resize", update);
    viewport?.removeEventListener("scroll", update);
    window.removeEventListener("resize", update);
    document.removeEventListener("focusin", update);
    document.removeEventListener("focusout", update);
  };
}