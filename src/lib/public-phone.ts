/** Public editorial contact only. Never apply to CRM, tenant or transport data. */
export const PUBLIC_PHONE = "819-592-3495";
export const PUBLIC_PHONE_E164 = "+18195923495";

// Historical public contact and the four fictitious contacts found in SEO copy.
const OLD_PUBLIC_CONTACT = /(?<!\d)(?:\+?1[\s.\-–—]*)?\(?581\)?[\s.\-–—]*994[\s.\-–—]*7717(?!\d)/g;
const FICTITIOUS_PUBLIC_CONTACTS = /(?<!\d)(?:\+?1[\s.\-–—]*)?(?:\(?418\)?[\s.\-–—]*555[\s.\-–—]*1234|800[\s.\-–—]*555[\s.\-–—]*0199|888[\s.\-–—]*872[\s.\-–—]*2720)(?!\d)/g;

/** Normalizes text/HTML at the public SEO render boundary; stored copy stays intact. */
export function normalizePublicContact(text: string): string {
  return text
    .replace(/(?:tel:|sms:)(?:\+?1[-\s.]*)?\(?581\)?[-\s.]*994[-\s.]*7717/gi, (match) => `${match.slice(0, 4)}${PUBLIC_PHONE_E164}`)
    .replace(/wa\.me\/(?:1)?581994(?:7717)/gi, "wa.me/18195923495")
    .replace(/tel:(?:\+?1[-\s.]*)?(?:418[-\s.]*555[-\s.]*1234|800[-\s.]*555[-\s.]*0199|888[-\s.]*872[-\s.]*2720)/gi, `tel:${PUBLIC_PHONE_E164}`)
    .replace(/1-888-VRAC-QC\s*\(1-888-872-(?:2720)\)/g, PUBLIC_PHONE)
    .replace(OLD_PUBLIC_CONTACT, PUBLIC_PHONE)
    .replace(FICTITIOUS_PUBLIC_CONTACTS, PUBLIC_PHONE);
}

const EDITORIAL_FIELDS = ["title", "meta_title", "meta_description", "h1", "intro", "content_html", "cover_image_alt", "og_title", "og_description"] as const;

export function normalizePublicSeoPage<T extends object>(page: T): T {
  const result = { ...page } as T & Record<string, unknown>;
  for (const key of EDITORIAL_FIELDS) {
    const value = result[key];
    if (typeof value === "string") Object.assign(result, { [key]: normalizePublicContact(value) });
  }
  for (const key of ["faq", "internal_links"] as const) {
    const value = result[key];
    if (Array.isArray(value)) Object.assign(result, {
      [key]: value.map((item) => {
        if (!item || typeof item !== "object") return item;
        return Object.fromEntries(Object.entries(item).map(([field, text]) => [field,
          typeof text === "string" ? normalizePublicContact(text) : text]));
      }),
    });
  }
  return result;
}