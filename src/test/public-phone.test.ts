import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PUBLIC_PHONE, PUBLIC_PHONE_E164 } from "@/lib/public-phone";

describe("Public editorial phone", () => {
  it("defines the public display and call source", () => {
    expect(PUBLIC_PHONE).toBe("819-592-3495");
    expect(PUBLIC_PHONE_E164).toBe("+18195923495");
  });
  it.each(["src/pages/SeoLandingPage.tsx", "scripts/prerender-seo.ts"])("uses corrected stored content without display masking in %s", (path) => {
    expect(readFileSync(path, "utf8")).not.toContain("normalizePublicSeoPage");
  });
  it.each([
    "index.html", "src/pages/Index.tsx", "src/pages/TransportRequest.tsx",
    "src/components/Questionnaire.tsx", "src/pages/SeoLandingPage.tsx", "scripts/prerender-seo.ts",
    "supabase/functions/site-assistant/index.ts", "supabase/functions/seo-qa-autofix/index.ts",
    "supabase/functions/_shared/transactional-email-templates/client-confirmation.tsx",
    "supabase/functions/_shared/transactional-email-templates/soumission-client.tsx",
  ])("has the correct public source in %s", (path) => {
    const source = readFileSync(path, "utf8");
    expect(source).not.toMatch(/581[^0-9]*994[^0-9]*7717/);
    expect(source).toContain(PUBLIC_PHONE);
  });
});