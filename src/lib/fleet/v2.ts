// ============================================================
// GESTION DE LA FLOTTE V2 — extensions (multi-entreprise)
// ------------------------------------------------------------
// Complète `src/lib/fleet/api.ts` : catégories d'unités, statuts
// administratif / opérationnel, compteurs, travaux à faire,
// dépenses, références de pièces, programmes d'entretien.
// L'isolation entre entreprises est appliquée par la base de
// données (politiques RLS), jamais par ce fichier.
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { TRUCK_TYPE_LABELS } from "@/lib/calendar-utils";
import type { Database } from "@/integrations/supabase/types";
import {
  PRIORITY_RANK, type Inspection, type Maintenance, type Repair, type Vehicle,
} from "./api";

export type WorkItem = Database["public"]["Tables"]["fleet_work_items"]["Row"];
export type Expense = Database["public"]["Tables"]["fleet_expenses"]["Row"];
export type MeterReading = Database["public"]["Tables"]["fleet_meter_readings"]["Row"];
export type PartRef = Database["public"]["Tables"]["fleet_part_refs"]["Row"];
export type ServiceProgram = Database["public"]["Tables"]["fleet_service_programs"]["Row"];

// ---------------- Référentiels ----------------

/** Une unité n'est pas forcément un camion : véhicules ET équipements. */
export const UNIT_CATEGORIES = [
  { value: "camion_10_roues", label: "Camion 10 roues", kind: "vehicule" },
  { value: "camion_12_roues", label: "Camion 12 roues", kind: "vehicule" },
  { value: "semi_dompeur", label: "Semi-dompeur", kind: "vehicule" },
  { value: "tracteur_routier", label: "Tracteur routier", kind: "vehicule" },
  { value: "fardier", label: "Fardier", kind: "vehicule" },
  { value: "remorque", label: "Remorque", kind: "remorque" },
  { value: "pickup", label: "Pickup", kind: "vehicule" },
  { value: "camion_service", label: "Camion de service", kind: "vehicule" },
  { value: "pelle", label: "Pelle mécanique", kind: "equipement" },
  { value: "chargeur", label: "Chargeur / loader", kind: "equipement" },
  { value: "bulldozer", label: "Bulldozer", kind: "equipement" },
  { value: "compacteur", label: "Compacteur", kind: "equipement" },
  { value: "nacelle", label: "Nacelle", kind: "equipement" },
  { value: "camion", label: "Autre véhicule", kind: "vehicule" },
  { value: "autre_equipement", label: "Autre équipement", kind: "equipement" },
] as const;

export const categoryLabel = (v?: string | null) =>
  UNIT_CATEGORIES.find((c) => c.value === v)?.label ?? "Unité";

export const categoryKind = (v?: string | null) =>
  UNIT_CATEGORIES.find((c) => c.value === v)?.kind ?? "vehicule";

/** Les heures moteur n'ont pas de sens pour une remorque. */
export const usesEngineHours = (v?: Vehicle | null) =>
  categoryKind(v?.category) !== "remorque";

export const ADMIN_STATUS = [
  { value: "actif", label: "Actif" },
  { value: "inactif", label: "Inactif" },
  { value: "vendu", label: "Vendu" },
  { value: "archive", label: "Archivé" },
] as const;

export const OPS_STATUS = [
  { value: "disponible", label: "Disponible", tone: "ok" },
  { value: "en_operation", label: "En opération", tone: "info" },
  { value: "a_surveiller", label: "À surveiller", tone: "warn" },
  { value: "au_garage", label: "Au garage", tone: "soon" },
  { value: "hors_service", label: "Hors service", tone: "bad" },
] as const;

export type Tone = "ok" | "info" | "warn" | "soon" | "bad";

/** Couleur + texte : jamais la couleur seule pour transmettre l'information. */
export const TONE_CLASS: Record<Tone, string> = {
  ok: "bg-primary/10 text-primary border-primary/30",
  info: "bg-secondary text-muted-foreground border-border",
  warn: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  soon: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  bad: "bg-destructive/10 text-destructive border-destructive/30",
};

export const opsStatus = (v?: Vehicle | null) =>
  OPS_STATUS.find((s) => s.value === (v?.ops_status ?? "disponible")) ?? OPS_STATUS[0];

export const adminStatusLabel = (v?: Vehicle | null) =>
  ADMIN_STATUS.find((s) => s.value === (v?.admin_status ?? "actif"))?.label ?? "Actif";

export const EXPENSE_CATEGORIES = [
  "entretien", "reparation", "pneus", "pieces", "carburant",
  "remorquage", "lavage", "assurance", "immatriculation", "autres",
] as const;

export const EXPENSE_LABELS: Record<string, string> = {
  entretien: "Entretien", reparation: "Réparation", pneus: "Pneus", pieces: "Pièces",
  carburant: "Carburant", remorquage: "Remorquage", lavage: "Lavage",
  assurance: "Assurance", immatriculation: "Immatriculation", autres: "Autres",
};

export const DOCUMENT_KINDS = [
  "immatriculation", "assurance", "inspection_mecanique", "facture_achat", "garantie",
  "financement", "manuel", "facture_entretien", "facture_reparation", "photo", "autre",
] as const;

export const DOCUMENT_LABELS: Record<string, string> = {
  immatriculation: "Immatriculation", assurance: "Assurance",
  inspection_mecanique: "Inspection mécanique", facture_achat: "Facture d'achat",
  garantie: "Garantie", financement: "Financement", manuel: "Manuel",
  facture_entretien: "Facture d'entretien", facture_reparation: "Facture de réparation",
  photo: "Photos", autre: "Autres", document: "Document",
};

export const WORK_STATUS_LABELS: Record<string, string> = {
  ouvert: "Ouvert", planifie: "Planifié", en_cours: "En cours",
  termine: "Terminé", annule: "Annulé",
};

/** Titre opérationnel : « T-12 — Freightliner 114SD ». */
export const unitTitle = (v?: Vehicle | null) => {
  if (!v) return "—";
  const model = [v.make, v.model].filter(Boolean).join(" ");
  const head = v.unit_number || v.name;
  return model ? `${head} — ${model}` : head;
};

export const unitSubtitle = (v?: Vehicle | null) => {
  if (!v) return "";
  // Les unités importées avant la V2 n'ont qu'un type de camion : on l'utilise.
  const label = v.category && v.category !== "camion"
    ? categoryLabel(v.category)
    : (TRUCK_TYPE_LABELS[v.type] ?? categoryLabel(v.category));
  return [label, v.year].filter(Boolean).join(" • ");
};

export const kmLabel = (n: number | null | undefined) =>
  n == null ? null : `${Number(n).toLocaleString("fr-CA")} km`;

export const hoursLabel = (n: number | null | undefined) =>
  n == null ? null : `${Number(n).toLocaleString("fr-CA")} h`;

// ---------------- Compteurs ----------------

export async function fetchReadings(vehicleId: string, limit = 50): Promise<MeterReading[]> {
  const { data, error } = await supabase.from("fleet_meter_readings").select("*")
    .eq("vehicle_id", vehicleId).order("read_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data ?? [];
}

/**
 * Enregistre un relevé. Le compteur du véhicule est mis à jour par la base
 * de données et ne recule jamais tout seul (sauf correction explicite).
 */
export async function addReading(opts: {
  vehicleId: string; km?: number | null; hours?: number | null;
  source?: string; sourceTable?: string | null; sourceId?: string | null;
  isCorrection?: boolean; notes?: string | null; readAt?: string;
}) {
  if (opts.km == null && opts.hours == null) return;
  if ((opts.km ?? 0) < 0 || (opts.hours ?? 0) < 0) throw new Error("Un compteur ne peut pas être négatif.");
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from("fleet_meter_readings").insert({
    vehicle_id: opts.vehicleId,
    odometer_km: opts.km ?? null,
    engine_hours: opts.hours ?? null,
    source: opts.source ?? "manuel",
    source_table: opts.sourceTable ?? null,
    source_id: opts.sourceId ?? null,
    is_correction: opts.isCorrection ?? false,
    notes: opts.notes ?? null,
    read_at: opts.readAt ?? new Date().toISOString(),
    created_by: userData.user?.id ?? null,
  } as never);
  if (error) throw error;
}

/** Vrai si la valeur saisie fait reculer le compteur (demande une confirmation). */
export const isMeterRegression = (current: number | null | undefined, next: number | null | undefined) =>
  current != null && next != null && Number(next) < Number(current);

// ---------------- Travaux à faire ----------------

export async function fetchWorkItems(vehicleId?: string, openOnly = false): Promise<WorkItem[]> {
  let q = supabase.from("fleet_work_items").select("*").order("created_at", { ascending: false });
  if (vehicleId) q = q.eq("vehicle_id", vehicleId);
  if (openOnly) q = q.not("status", "in", "(termine,annule)");
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function saveWorkItem(w: Partial<WorkItem> & { vehicle_id: string; title: string }) {
  if (w.id) {
    const { error } = await supabase.from("fleet_work_items").update(w).eq("id", w.id);
    if (error) throw error;
    return w.id;
  }
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("fleet_work_items")
    .insert({ ...w, created_by: userData.user?.id ?? null } as never).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function closeWorkItem(id: string, status: "termine" | "annule" = "termine") {
  const { error } = await supabase.from("fleet_work_items")
    .update({ status, closed_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

/**
 * Enregistre les constats d'une inspection comme travaux à faire.
 * Un constat déjà ouvert n'est pas dupliqué : on incrémente son compteur
 * d'occurrences (détection des problèmes récurrents).
 */
export async function syncWorkItemsFromInspection(
  insp: Inspection, points: { key: string; label: string }[],
) {
  const checks = (insp.checks ?? {}) as Record<string, string>;
  const open = await fetchWorkItems(insp.vehicle_id, true);
  for (const p of points) {
    const value = checks[p.key];
    if (value !== "surveiller" && value !== "probleme") continue;
    const priority = value === "probleme" ? "elevee" : "normale";
    const existing = open.find((w) => w.check_key === p.key);
    if (existing) {
      await supabase.from("fleet_work_items").update({
        occurrences: (existing.occurrences ?? 1) + 1,
        last_seen_on: insp.inspected_on,
        priority: value === "probleme" ? "elevee" : existing.priority,
        inspection_id: insp.id,
      }).eq("id", existing.id);
      continue;
    }
    await saveWorkItem({
      vehicle_id: insp.vehicle_id,
      title: p.label,
      description: insp.comment,
      priority,
      status: "ouvert",
      source: "inspection",
      inspection_id: insp.id,
      check_key: p.key,
      last_seen_on: insp.inspected_on,
    });
  }
}

// ---------------- Dépenses ----------------

export async function fetchExpenses(vehicleId?: string): Promise<Expense[]> {
  let q = supabase.from("fleet_expenses").select("*").order("spent_on", { ascending: false });
  if (vehicleId) q = q.eq("vehicle_id", vehicleId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function saveExpense(e: Partial<Expense> & { vehicle_id: string }) {
  if (Number(e.amount ?? 0) < 0) throw new Error("Un montant ne peut pas être négatif.");
  if (e.id) {
    const { error } = await supabase.from("fleet_expenses").update(e).eq("id", e.id);
    if (error) throw error;
    return e.id;
  }
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("fleet_expenses")
    .insert({ ...e, created_by: userData.user?.id ?? null } as never).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function deleteExpense(id: string) {
  const { error } = await supabase.from("fleet_expenses").delete().eq("id", id);
  if (error) throw error;
}

// ---------------- Références de pièces ----------------

export async function fetchPartRefs(vehicleId?: string): Promise<PartRef[]> {
  let q = supabase.from("fleet_part_refs").select("*").order("name");
  if (vehicleId) q = q.eq("vehicle_id", vehicleId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function savePartRef(p: Partial<PartRef> & { name: string }) {
  if (p.id) {
    const { error } = await supabase.from("fleet_part_refs").update(p).eq("id", p.id);
    if (error) throw error;
    return p.id;
  }
  const { data, error } = await supabase.from("fleet_part_refs").insert(p as never).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function deletePartRef(id: string) {
  const { error } = await supabase.from("fleet_part_refs").delete().eq("id", id);
  if (error) throw error;
}

// ---------------- Programmes d'entretien récurrents ----------------

export async function fetchPrograms(vehicleId?: string): Promise<ServiceProgram[]> {
  let q = supabase.from("fleet_service_programs").select("*").eq("is_active", true).order("name");
  if (vehicleId) q = q.eq("vehicle_id", vehicleId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function saveProgram(p: Partial<ServiceProgram> & { name: string }) {
  if (p.id) {
    const { error } = await supabase.from("fleet_service_programs").update(p).eq("id", p.id);
    if (error) throw error;
    return p.id;
  }
  const { data, error } = await supabase.from("fleet_service_programs")
    .insert(p as never).select("id").single();
  if (error) throw error;
  return data.id as string;
}

/** Prochaine échéance calculée à partir d'un programme récurrent. */
export function nextFromProgram(program: ServiceProgram, atKm?: number | null, atHours?: number | null, atDate?: string) {
  const base = atDate ? new Date(`${atDate}T12:00:00`) : new Date();
  return {
    next_due_km: program.interval_km && atKm != null ? Number(atKm) + Number(program.interval_km) : null,
    next_due_hours: program.interval_hours && atHours != null ? Number(atHours) + Number(program.interval_hours) : null,
    next_due_date: program.interval_days
      ? new Date(base.getTime() + program.interval_days * 86400000).toISOString().slice(0, 10)
      : null,
    alert_days_before: program.alert_days_before,
    alert_km_margin: program.alert_km_margin,
    alert_hours_margin: program.alert_hours_margin,
  };
}

// ---------------- État des échéances ----------------

export type DueState = { state: "ok" | "bientot" | "retard"; reason: string | null };

/** Le PREMIER seuil atteint (date, km ou heures) déclenche l'état. */
export function maintenanceDue(m: Maintenance, vehicle?: Vehicle | null): DueState {
  const today = new Date().toISOString().slice(0, 10);
  const reasons: string[] = [];
  let state: DueState["state"] = "ok";

  const bump = (s: DueState["state"]) => {
    if (s === "retard" || (s === "bientot" && state === "ok")) state = s;
  };

  if (m.next_due_date) {
    const days = Math.round((new Date(`${m.next_due_date}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86400000);
    if (days < 0) { bump("retard"); reasons.push(`en retard de ${Math.abs(days)} j`); }
    else if (days <= (m.alert_days_before ?? 14)) { bump("bientot"); reasons.push(`dans ${days} j`); }
  }
  const km = vehicle?.odometer_km != null ? Number(vehicle.odometer_km) : null;
  if (m.next_due_km && km != null) {
    const left = Number(m.next_due_km) - km;
    if (left < 0) { bump("retard"); reasons.push(`${Math.abs(left).toLocaleString("fr-CA")} km dépassés`); }
    else if (left <= Number(m.alert_km_margin ?? 2000)) { bump("bientot"); reasons.push(`dans ${left.toLocaleString("fr-CA")} km`); }
  }
  const hours = vehicle?.engine_hours != null ? Number(vehicle.engine_hours) : null;
  if (m.next_due_hours && hours != null) {
    const left = Number(m.next_due_hours) - hours;
    if (left < 0) { bump("retard"); reasons.push(`${Math.abs(left).toLocaleString("fr-CA")} h dépassées`); }
    else if (left <= Number(m.alert_hours_margin ?? 100)) { bump("bientot"); reasons.push(`dans ${left.toLocaleString("fr-CA")} h`); }
  }
  return { state, reason: reasons.length ? reasons.join(" · ") : null };
}

// ---------------- Tableau de bord ----------------

export interface FleetSnapshot {
  vehicles: Vehicle[];
  maint: Maintenance[];
  repairs: Repair[];
  inspections: Inspection[];
  workItems: WorkItem[];
}

export interface AttentionRow {
  id: string;
  vehicleId: string;
  title: string;
  detail: string;
  level: "urgent" | "bientot" | "surveiller";
  tab: string;
}

/** Toutes les valeurs proviennent des données réelles de la base. */
export function buildDashboard(s: FleetSnapshot) {
  const today = new Date().toISOString().slice(0, 10);
  const byId = new Map(s.vehicles.map((v) => [v.id, v]));
  const attention: AttentionRow[] = [];

  const dueByMaint = new Map<string, DueState>();
  for (const m of s.maint) {
    if (!m.next_due_date && !m.next_due_km && !m.next_due_hours) continue;
    const d = maintenanceDue(m, byId.get(m.vehicle_id));
    dueByMaint.set(m.id, d);
    if (d.state === "ok") continue;
    attention.push({
      id: `m-${m.id}`, vehicleId: m.vehicle_id,
      title: m.next_type || m.maintenance_type || "Entretien préventif",
      detail: d.reason ?? "", level: d.state === "retard" ? "urgent" : "bientot", tab: "entretien",
    });
  }

  const openRepairs = s.repairs.filter((r) => r.status !== "terminee" && r.status !== "annulee");
  for (const r of openRepairs) {
    const late = !!r.scheduled_date && r.scheduled_date < today;
    if (r.priority === "urgente" || late) {
      attention.push({
        id: `r-${r.id}`, vehicleId: r.vehicle_id, title: r.problem,
        detail: r.priority === "urgente" ? "URGENT" : "planifiée en retard",
        level: "urgent", tab: "reparations",
      });
    }
  }

  const openWork = s.workItems.filter((w) => w.status !== "termine" && w.status !== "annule");
  for (const w of openWork) {
    if (w.priority === "urgente") {
      attention.push({ id: `w-${w.id}`, vehicleId: w.vehicle_id, title: w.title, detail: "travail urgent", level: "urgent", tab: "travaux" });
    } else if ((w.occurrences ?? 1) > 1) {
      attention.push({
        id: `w-${w.id}`, vehicleId: w.vehicle_id, title: w.title,
        detail: `signalé ${w.occurrences} fois`, level: "surveiller", tab: "travaux",
      });
    }
  }

  const counts = (v: AttentionRow["level"]) => attention.filter((a) => a.level === v).length;

  const fleetState = OPS_STATUS.map((s2) => ({
    ...s2, count: s.vehicles.filter((v) => (v.ops_status ?? "disponible") === s2.value).length,
  }));

  const maintWithDue = [...dueByMaint.values()];
  const inspectionProblems = s.inspections.filter((i) => {
    if (!i.has_problem) return false;
    const linked = s.repairs.filter((r) => r.inspection_id === i.id);
    return !linked.length || linked.some((r) => r.status !== "terminee");
  }).length;

  const todayRows = attention
    .filter((a) => a.level === "urgent")
    .concat(attention.filter((a) => a.level === "bientot"))
    .slice(0, 6);

  return {
    attention,
    urgent: counts("urgent"),
    soon: counts("bientot"),
    watch: counts("surveiller"),
    total: s.vehicles.length,
    fleetState,
    maintenance: {
      ok: s.maint.filter((m) => dueByMaint.get(m.id)?.state === undefined || dueByMaint.get(m.id)?.state === "ok").length,
      soon: maintWithDue.filter((d) => d.state === "bientot").length,
      late: maintWithDue.filter((d) => d.state === "retard").length,
    },
    repairs: {
      urgent: openRepairs.filter((r) => r.priority === "urgente").length,
      toPlan: openRepairs.filter((r) => r.status === "a_planifier" || r.status === "a_diagnostiquer").length,
      inProgress: openRepairs.filter((r) => r.status === "en_reparation" || r.status === "planifiee" || r.status === "attente_pieces").length,
    },
    inspections: {
      done: s.inspections.length,
      problems: inspectionProblems,
    },
    todayRows,
  };
}

export const sortByPriority = <T extends { priority: string }>(rows: T[]) =>
  [...rows].sort((a, b) => (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3));

// ---------------- Points d'inspection selon le type d'unité ----------------

const BASE_POINTS = [
  { key: "huile", label: "Huile" },
  { key: "pneus", label: "Pneus" },
  { key: "air", label: "Air" },
  { key: "lumieres", label: "Lumières" },
  { key: "freins", label: "Freins" },
  { key: "fuites", label: "Fuites" },
  { key: "dompe", label: "Dompe / benne" },
  { key: "hydraulique", label: "Hydraulique" },
];

const POINTS_BY_KIND: Record<string, { key: string; label: string }[]> = {
  vehicule: BASE_POINTS,
  remorque: [
    { key: "pneus", label: "Pneus" },
    { key: "lumieres", label: "Lumières" },
    { key: "freins", label: "Freins" },
    { key: "attelage", label: "Attelage" },
    { key: "structure", label: "Structure / châssis" },
    { key: "dompe", label: "Dompe / benne" },
  ],
  equipement: [
    { key: "huile", label: "Huile" },
    { key: "fuites", label: "Fuites" },
    { key: "hydraulique", label: "Hydraulique" },
    { key: "chenilles", label: "Chenilles / pneus" },
    { key: "godet", label: "Godet / outil" },
    { key: "graissage", label: "Graissage" },
    { key: "securite", label: "Sécurité (arrêt d'urgence)" },
  ],
};

/** Un pickup, une remorque et une pelle n'ont pas la même liste d'inspection. */
export function inspectionPointsFor(vehicle?: Vehicle | null) {
  if (vehicle?.category === "pickup") {
    return BASE_POINTS.filter((p) => p.key !== "dompe" && p.key !== "hydraulique" && p.key !== "air");
  }
  return POINTS_BY_KIND[categoryKind(vehicle?.category)] ?? BASE_POINTS;
}
