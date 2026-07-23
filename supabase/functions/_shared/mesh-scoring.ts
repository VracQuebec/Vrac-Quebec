// Deterministic Blog ↔ SEO scoring. Zero AI calls.
// Shared by blog-mesh-worker for post→pages and page→posts computation.

export type SeoPageLite = {
  id: string;
  slug: string;
  title: string;
  meta_description: string | null;
  city_slug: string;
  material_slug: string | null;
  service_slug: string | null;
};
export type PostLite = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string | null;
};

export function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasTerm(haystack: string, term: string): boolean {
  if (!term) return false;
  const t = normalize(term).replace(/-/g, " ");
  if (!t) return false;
  return new RegExp(`(^|\\s)${t.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}(\\s|$)`).test(haystack);
}

/** Cheap deterministic hash (FNV-1a) — enough for change-detection. */
export function hashContent(...parts: (string | null | undefined)[]): string {
  const s = parts.map((p) => p ?? "").join("¦");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function scorePair(
  post: { text: string; title: string },
  page: SeoPageLite,
  cityName: string,
  materialName: string,
  serviceName: string,
): { score: number; reasons: Record<string, unknown> } {
  let score = 0;
  const reasons: Record<string, unknown> = {};
  const inTitle = (t: string) => hasTerm(post.title, t);

  if (page.city_slug) {
    const hit = hasTerm(post.text, cityName) || hasTerm(post.text, page.city_slug);
    if (hit) {
      score += 40 + (inTitle(cityName) ? 10 : 0);
      reasons.city = cityName;
    }
  }
  if (page.material_slug && materialName) {
    const hit = hasTerm(post.text, materialName) || hasTerm(post.text, page.material_slug);
    if (hit) {
      score += 30 + (inTitle(materialName) ? 10 : 0);
      reasons.material = materialName;
    }
  }
  if (page.service_slug && serviceName) {
    const hit = hasTerm(post.text, serviceName) || hasTerm(post.text, page.service_slug);
    if (hit) {
      score += 20 + (inTitle(serviceName) ? 5 : 0);
      reasons.service = serviceName;
    }
  }
  return { score, reasons };
}

export const MESH_THRESHOLD = 45;
export const MAX_LINKS_PER_POST = 6;