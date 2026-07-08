import DOMPurify from "dompurify";

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
}

export function sanitizeHtml(html: string): string {
  if (typeof window === "undefined") return html;
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ["target", "rel", "loading", "decoding"],
    FORBID_TAGS: ["script", "style", "iframe", "form", "input", "button"],
    FORBID_ATTR: ["onerror", "onload", "onclick"],
  });
}

export function formatDateFr(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function shareUrls(url: string, title: string) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    twitter: `https://twitter.com/intent/tweet?url=${u}&text=${t}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
    email: `mailto:?subject=${t}&body=${u}`,
  };
}

export function estimateReadingTime(text: string): number {
  const words = text.replace(/<[^>]+>/g, " ").trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

export type TocEntry = { id: string; text: string; level: 2 | 3 };

/** Injects id attributes on h2/h3 in the HTML and returns the TOC entries. */
export function processContentWithToc(html: string): { html: string; toc: TocEntry[] } {
  if (typeof window === "undefined" || !html) return { html, toc: [] };
  const doc = new DOMParser().parseFromString(html, "text/html");
  const headings = doc.body.querySelectorAll("h2, h3");
  const toc: TocEntry[] = [];
  const used = new Set<string>();
  headings.forEach((h) => {
    const text = (h.textContent || "").trim();
    if (!text) return;
    let base = slugify(text) || "section";
    let id = base;
    let i = 2;
    while (used.has(id)) { id = `${base}-${i++}`; }
    used.add(id);
    h.setAttribute("id", id);
    toc.push({ id, text, level: h.tagName === "H2" ? 2 : 3 });
  });
  // Optimise les images inline du contenu : lazy loading + decoding async + title fallback
  doc.body.querySelectorAll("img").forEach((img) => {
    if (!img.getAttribute("loading")) img.setAttribute("loading", "lazy");
    if (!img.getAttribute("decoding")) img.setAttribute("decoding", "async");
    const alt = img.getAttribute("alt") || "";
    if (alt && !img.getAttribute("title")) img.setAttribute("title", alt);
  });
  return { html: doc.body.innerHTML, toc };
}

/** Extract FAQ pairs (H3 question + following paragraphs) inside an H2 whose title matches FAQ/questions. */
export function extractFaqFromHtml(html: string): Array<{ question: string; answer: string }> {
  if (typeof window === "undefined" || !html) return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const h2s = Array.from(doc.body.querySelectorAll("h2"));
  const faqH2 = h2s.find((h) => /faq|questions? fr[ée]quentes?/i.test(h.textContent || ""));
  if (!faqH2) return [];
  const out: Array<{ question: string; answer: string }> = [];
  let node: Element | null = faqH2.nextElementSibling;
  let current: { question: string; answer: string } | null = null;
  while (node && node.tagName !== "H2") {
    if (node.tagName === "H3") {
      if (current) out.push(current);
      current = { question: (node.textContent || "").trim(), answer: "" };
    } else if (current) {
      current.answer += " " + (node.textContent || "").trim();
    }
    node = node.nextElementSibling;
  }
  if (current) out.push(current);
  return out.map((f) => ({ question: f.question, answer: f.answer.trim() })).filter((f) => f.question && f.answer);
}

export const SITE_URL = "https://vracquebec.ca";

export function absoluteUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}