// Tâches refusées (lecture seule) : une ligne par tâche existante, aucune écriture, aucun doublon.
export type RefusedTaskRaw = {
  id: string; city_slug: string; material_slug: string | null; service_slug: string | null;
  status: string; attempts: number | null; last_error: string | null; updated_at: string; finished_at: string | null;
};
export type RefusedRow = RefusedTaskRaw & {
  cityName: string | null; comboLabel: string | null; availability: "confirmee" | "exclue" | "inconnue" | null;
  refusedAt: string; reason: string | null;
};
export type RefusedFilters = { city: string; combo: string; availability: string; reason: string };
export const REFUSED_STATUSES = ["needs_retry"] as const;

export function buildRefusedRows(
  tasks: RefusedTaskRaw[],
  ctx: { cityName: (s: string) => string | null; comboLabel: (city: string, t: RefusedTaskRaw) => string | null; availability: (city: string, t: RefusedTaskRaw) => RefusedRow["availability"] },
): RefusedRow[] {
  const seen = new Set<string>();
  const out: RefusedRow[] = [];
  for (const t of tasks) {
    if (seen.has(t.id)) continue; // jamais deux lignes pour la même tâche
    seen.add(t.id);
    out.push({ ...t, cityName: ctx.cityName(t.city_slug), comboLabel: ctx.comboLabel(t.city_slug, t),
      availability: ctx.availability(t.city_slug, t), refusedAt: t.finished_at ?? t.updated_at,
      reason: t.last_error?.trim() ? t.last_error.trim() : null });
  }
  return out.sort((a, b) => b.refusedAt.localeCompare(a.refusedAt));
}

export const comboKeyOf = (t: Pick<RefusedTaskRaw, "material_slug" | "service_slug">) =>
  t.material_slug ? `material|${t.material_slug}` : t.service_slug ? `service|${t.service_slug}` : "hub|";

export function filterRefused(rows: RefusedRow[], f: RefusedFilters): RefusedRow[] {
  return rows.filter((r) => (!f.city || r.city_slug === f.city)
    && (!f.combo || comboKeyOf(r) === f.combo)
    && (!f.availability || (r.availability ?? "absente") === f.availability)
    && (!f.reason || (r.reason ?? "absent") === f.reason));
}

/** Nom lisible d'une ville; jamais inventé : si absent, le dire et garder l'identifiant. */
export const displayCityName = (name: string | null | undefined, slug: string) =>
  name?.trim() ? name.trim() : `Nom de ville indisponible (${slug})`;
