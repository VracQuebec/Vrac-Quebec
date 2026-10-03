// Miroir de public.agd_occurrences (récurrence) — même règle côté écran et côté rappels.
export type Recurrence = "aucune" | "quotidienne" | "hebdomadaire" | "aux_2_semaines" | "mensuelle";

export function occurrences(startIso: string, rec: Recurrence, until: string | null, from: Date, to: Date): Date[] {
  const start = new Date(startIso);
  const out: Date[] = [];
  const max = rec === "aucune" ? 0 : 800;
  for (let n = 0; n <= max; n++) {
    const d = new Date(start);
    if (rec === "quotidienne") d.setDate(d.getDate() + n);
    else if (rec === "hebdomadaire") d.setDate(d.getDate() + 7 * n);
    else if (rec === "aux_2_semaines") d.setDate(d.getDate() + 14 * n);
    else if (rec === "mensuelle") d.setMonth(d.getMonth() + n);
    if (until && d.toISOString().slice(0, 10) > until) break;
    if (d >= to) break;
    if (d >= from) out.push(d);
  }
  return out;
}
