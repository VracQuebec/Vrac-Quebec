// Lot 2 — décompte des voyages. Le côté « reçu » (client, coupon) et le côté « livré »
// (entrepreneur) vérifient la même activité : ils ne s'additionnent jamais.
export type Trip = {
  id: string; side: "recu" | "livre"; kind: "voyage" | "total_jour"; trip_date: string; count: number;
  occurred_at: string | null; entrepreneur_label: string | null; driver_label: string | null; truck_label: string | null;
  destination: string | null; coupon_number: number | null; photo_path: string | null; voided_at: string | null; created_at: string;
};

export type DayGroup = {
  date: string; entrepreneur: string;
  recu: number | null; livre: number | null;
  /** Valeur retenue : identique des deux côtés, ou le seul côté saisi. */
  agreed: number | null;
  gap: number; drivers: string[]; trucks: string[]; photos: number;
};

const norm = (s: string | null) => (s ?? "").trim().toLowerCase();

/** Un total quotidien saisi remplace les voyages unitaires du même côté (dernier total gagne). */
function sideCount(rows: Trip[]): number | null {
  if (rows.length === 0) return null;
  const totals = rows.filter((r) => r.kind === "total_jour").sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (totals.length) return totals[totals.length - 1].count;
  return rows.reduce((n, r) => n + r.count, 0);
}

export function summarize(trips: Trip[]): { groups: DayGroup[]; total: number; pending: number } {
  const live = trips.filter((t) => !t.voided_at);
  const map = new Map<string, Trip[]>();
  for (const t of live) {
    const key = `${t.trip_date}|${norm(t.entrepreneur_label) || "—"}`;
    (map.get(key) ?? map.set(key, []).get(key)!).push(t);
  }
  const groups: DayGroup[] = [...map.entries()].map(([key, rows]) => {
    const [date] = key.split("|");
    const recu = sideCount(rows.filter((r) => r.side === "recu"));
    const livre = sideCount(rows.filter((r) => r.side === "livre"));
    const agreed = recu !== null && livre !== null ? (recu === livre ? recu : null) : (recu ?? livre);
    return {
      date, entrepreneur: rows.find((r) => r.entrepreneur_label)?.entrepreneur_label ?? "Entrepreneur non précisé",
      recu, livre, agreed, gap: recu !== null && livre !== null ? recu - livre : 0,
      drivers: [...new Set(rows.map((r) => r.driver_label).filter(Boolean) as string[])],
      trucks: [...new Set(rows.map((r) => r.truck_label).filter(Boolean) as string[])],
      photos: rows.filter((r) => r.photo_path).length,
    };
  }).sort((a, b) => b.date.localeCompare(a.date) || a.entrepreneur.localeCompare(b.entrepreneur));
  return {
    groups,
    total: groups.reduce((n, g) => n + (g.agreed ?? 0), 0),
    pending: groups.filter((g) => g.agreed === null).length,
  };
}
