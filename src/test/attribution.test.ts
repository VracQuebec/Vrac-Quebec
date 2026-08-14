// Attribution marketing : capture « première touche » côté navigateur.
import { beforeEach, describe, expect, it } from "vitest";
import { getAttribution } from "@/lib/analytics/attribution";

const setUrl = (search: string, referrer = "") => {
  window.history.replaceState({}, "", `/${search}`);
  Object.defineProperty(document, "referrer", { value: referrer, configurable: true });
};

describe("attribution", () => {
  beforeEach(() => sessionStorage.clear());

  it("capte les paramètres utm", () => {
    setUrl("?utm_source=facebook&utm_medium=cpc&utm_campaign=remblai");
    expect(getAttribution()).toMatchObject({
      utm_source: "facebook", utm_medium: "cpc", utm_campaign: "remblai",
    });
  });

  it("retient la première touche pour la session", () => {
    setUrl("?utm_source=google");
    getAttribution();
    setUrl("?utm_source=facebook");
    expect(getAttribution().utm_source).toBe("google");
  });

  it("ignore un référent interne", () => {
    setUrl("", `${window.location.origin}/blog`);
    expect(getAttribution().landing_referrer).toBeNull();
  });

  it("conserve un référent externe", () => {
    setUrl("", "https://www.google.com/");
    expect(getAttribution().landing_referrer).toBe("https://www.google.com/");
  });
});
