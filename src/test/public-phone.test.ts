import { describe, expect, it } from "vitest";
import { PUBLIC_PHONE, PUBLIC_PHONE_E164, normalizePublicContact, normalizePublicSeoPage } from "@/lib/public-phone";

describe("Public editorial phone", () => {
  const old = ["581", "994", "7717"];
  it.each(["-", " ", ".", "\u00a0", "–", ""])("replaces historical formatting %s", (separator) => {
    expect(normalizePublicContact(old.join(separator))).toBe(PUBLIC_PHONE);
  });
  it("normalizes calls, SMS, WhatsApp and international formats", () => {
    const digits = old.join("");
    expect(normalizePublicContact(`tel:+1${digits}`)).toBe(`tel:${PUBLIC_PHONE_E164}`);
    expect(normalizePublicContact(`sms:1${digits}?body=Bonjour`)).toBe(`sms:${PUBLIC_PHONE_E164}?body=Bonjour`);
    expect(normalizePublicContact(`https://wa.me/1${digits}`)).toBe("https://wa.me/18195923495");
    expect(normalizePublicContact(`+1 (${old[0]}) ${old[1]}-${old[2]}`)).toBe(PUBLIC_PHONE);
  });
  it.each(["tel:418-555-1234", "tel:+1-800-555-0199", "(418) 555-1234", "1-888-VRAC-QC (1-888-872-2720)"])("corrects audited fictitious public contact %s", (text) => {
    expect(normalizePublicContact(text)).toBe(text.startsWith("tel:") ? `tel:${PUBLIC_PHONE_E164}` : PUBLIC_PHONE);
  });
  it("does not mutate stored content or touch CRM fields, IDs or quantities", () => {
    const page = {
      title: "Vrac Québec", content_html: `<a href="tel:${old.join("")}">${old.join("-")}</a>`,
      faq: [{ question: "Contact ?", answer: old.join(" ") }],
      internal_links: [{ href: `tel:+1${old.join("")}`, label: old.join("-") }],
      id: "167", phone: old.join("-"), quantity: 200, latitude: 46.81, longitude: -71.21,
    };
    const before = JSON.stringify(page);
    const rendered = normalizePublicSeoPage(page);
    expect(JSON.stringify(page)).toBe(before);
    expect(rendered.content_html).toBe(`<a href="tel:${PUBLIC_PHONE_E164}">${PUBLIC_PHONE}</a>`);
    expect(rendered.faq[0].answer).toBe(PUBLIC_PHONE);
    expect(rendered.internal_links[0].href).toBe(`tel:${PUBLIC_PHONE_E164}`);
    expect(rendered.phone).toBe(page.phone);
    expect(rendered.id).toBe("167");
    expect(rendered.quantity).toBe(200);
    expect(rendered.latitude).toBe(46.81);
    expect(rendered.longitude).toBe(-71.21);
  });
  it("retains unrelated and longer identifiers", () => {
    const id = `99${old.join("")}99`;
    expect(normalizePublicContact(`#167 · 200 tonnes · G1A 1A1 · ${id}`)).toBe(`#167 · 200 tonnes · G1A 1A1 · ${id}`);
  });
});