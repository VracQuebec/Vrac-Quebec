// LOG-01 — calculs purs de la journée de logbook (prototype non certifié).
// Aucun compteur réglementaire ni verdict « autorisé à conduire » (LOG-02).
export type DutyStatus = "repos" | "couchette" | "conduite" | "travail";
export const DUTY: { value: DutyStatus; label: string }[] = [
  { value: "repos", label: "Repos" },
  { value: "couchette", label: "Repos — couchette admissible" },
  { value: "conduite", label: "Conduite" },
  { value: "travail", label: "Travail autre que la conduite" },
];
export const CATEGORIES = [
  ["ronde", "Ronde"], ["chargement", "Chargement"], ["attente", "Attente"], ["pesee", "Pesée"],
  ["dechargement", "Déchargement"], ["carburant", "Carburant"], ["entretien", "Entretien"], ["autre", "Autre"],
] as const;
export const dutyLabel = (s: string) => DUTY.find((d) => d.value === s)?.label ?? s;
export const catLabel = (c?: string | null) => CATEGORIES.find(([v]) => v === c)?.[1] ?? null;

/** Décalage (minutes) d'un fuseau à un instant donné. */
export function tzOffsetMin(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/** Heure locale (AAAA-MM-JJ + HH:MM) d'un fuseau → instant UTC. */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let off = tzOffsetMin(tz, new Date(guess));
  let t = guess - off * 60000;
  const off2 = tzOffsetMin(tz, new Date(t));
  if (off2 !== off) { off = off2; t = guess - off * 60000; }
  return new Date(t);
}

export function fmtLocal(iso: string | Date, tz: string, withDate = false) {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    ...(withDate ? { year: "numeric", month: "2-digit", day: "2-digit" } : {}),
  }).format(new Date(iso));
}

/** Bornes de la journée de logbook (début désigné, durée 24 h — à revoir aux changements d'heure en LOG-02). */
export function dayBounds(date: string, dayStart: string, tz: string) {
  const start = zonedToUtc(date, dayStart.slice(0, 5), tz);
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  const end = zonedToUtc(next, dayStart.slice(0, 5), tz);
  return { start, end };
}

export type LogEvent = { id: string; duty_status: string; started_at: string; ended_at: string | null; state: string };
export type Segment = { id: string | null; status: DutyStatus | "a_completer"; from: number; to: number; ongoing?: boolean };

/** Segments de la journée; les trous restent « à compléter », jamais inventés. */
export function daySegments(events: LogEvent[], start: Date, end: Date, now = new Date()) {
  const s0 = start.getTime(), e0 = end.getTime();
  const horizon = Math.min(e0, now.getTime());
  const act = events.filter((e) => e.state === "actif")
    .map((e) => ({ e, a: Date.parse(e.started_at), b: e.ended_at ? Date.parse(e.ended_at) : now.getTime() }))
    .filter(({ a, b }) => b > s0 && a < e0)
    .sort((x, y) => x.a - y.a);
  const segs: Segment[] = [];
  let cur = s0;
  for (const { e, a, b } of act) {
    const from = Math.max(a, s0), to = Math.min(b, e0);
    if (from > cur) segs.push({ id: null, status: "a_completer", from: cur, to: Math.min(from, horizon) });
    segs.push({ id: e.id, status: e.duty_status as DutyStatus, from, to, ongoing: !e.ended_at });
    cur = Math.max(cur, to);
  }
  if (cur < horizon) segs.push({ id: null, status: "a_completer", from: cur, to: horizon });
  const filtered = segs.filter((g) => g.to > g.from);
  const missingMin = Math.round(filtered.filter((g) => g.status === "a_completer").reduce((n, g) => n + g.to - g.from, 0) / 60000);
  const future = now.getTime() < e0;
  // Journée « complète » uniquement si passée et sans trou — reste « non vérifiée » (prototype).
  const completeness: "future_ou_en_cours" | "incomplete" | "couverte_non_verifiee" =
    future ? "future_ou_en_cours" : missingMin > 0 ? "incomplete" : "couverte_non_verifiee";
  return { segments: filtered, missingMin, completeness };
}

export const newClientId = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
