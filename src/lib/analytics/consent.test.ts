import { describe, it, expect, beforeEach } from "vitest";
import { saveConsent, readConsent, analyticsAllowed } from "./consent";
import { trackPageView, trackEvent, sanitizeSearch, isPrivateAnalyticsPath } from "./ga4";

const calls: unknown[][] = [];
beforeEach(() => { localStorage.clear(); calls.length = 0; window.gtag = (...a: unknown[]) => { calls.push(a); }; document.getElementById("vq-ga4")?.remove(); });
const sent = () => calls.filter(c => c[0] === "event");

describe("consentement GA", () => {
  it("aucun envoi sans choix", () => { trackPageView("/remblai"); expect(sent()).toHaveLength(0); expect(document.getElementById("vq-ga4")).toBeNull(); });
  it("aucun envoi après refus", () => { saveConsent(false); trackPageView("/remblai"); expect(sent()).toHaveLength(0); expect(analyticsAllowed()).toBe(false); });
  it("accepter charge GA et envoie une page publique", () => {
    saveConsent(true); expect(document.getElementById("vq-ga4")).not.toBeNull();
    trackPageView("/remblai"); expect(sent()).toHaveLength(1);
    expect(readConsent()?.advertising).toBe(false);
  });
  it("changement de choix : refus après accord bloque", () => { saveConsent(true); saveConsent(false); trackPageView("/remblai"); expect(sent()).toHaveLength(0); });
  it("pages privées jamais mesurées", () => {
    saveConsent(true);
    for (const p of ["/admin", "/entrepreneur/crm", "/portail/remblai", "/partenaire/soumissions"]) { expect(isPrivateAnalyticsPath(p)).toBe(true); trackPageView(p); }
    expect(sent()).toHaveLength(0);
  });
  it("codes et jetons retirés de l'adresse", () => {
    expect(sanitizeSearch("code=123456&secret=abc&requestId=9&utm_source=fb")).toBe("?utm_source=fb");
    saveConsent(true); trackPageView("/remblai?linkId=x&utm_campaign=hiver");
    const p = sent()[0][2] as Record<string, string>;
    expect(p.page_path).toBe("/remblai?utm_campaign=hiver"); expect(p.page_location).not.toMatch(/linkId/);
  });
  it("événements : liste blanche et valeurs sûres seulement", () => {
    saveConsent(true);
    trackEvent("lead_created", { form: "parcours", email: "a@b.c" });
    trackEvent("custom_x", { a: "b" });
    trackEvent("home_cta", { cta: "jean@exemple.com" });
    expect(sent()).toHaveLength(2);
    expect(sent()[0][2]).toEqual({ send_to: "G-T6HYZVY8E0", form: "parcours" });
    expect(sent()[1][2]).toEqual({ send_to: "G-T6HYZVY8E0" });
  });
});
