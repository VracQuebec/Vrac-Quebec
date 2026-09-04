// ============================================================
// GESTION DE LA FLOTTE — couche d'accès (back-office uniquement)
// ------------------------------------------------------------
// Réutilise les structures existantes :
//  - `trucks`          : registre unique des véhicules
//  - `drivers`         : chauffeurs (inspections)
//  - `calendar_events` : LE calendrier administratif (aucun doublon)
//  - `crm_notify` / `crm_notifications` : LE centre d'alertes
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Vehicle = Database["public"]["Tables"]["trucks"]["Row"];
export type Maintenance = Database["public"]["Tables"]["fleet_maintenance"]["Row"];
export type Repair = Database["public"]["Tables"]["fleet_repairs"]["Row"];
export type Inspection = Database["public"]["Tables"]["fleet_inspections"]["Row"];
export type Part = Database["public"]["Tables"]["fleet_parts"]["Row"];
export type Cost = Database["public"]["Tables"]["fleet_costs"]["Row"];
export type FleetEvent = Database["public"]["Tables"]["calendar_events"]["Row"];

export const SERVICE_STATUS_LABELS: Record<string, string> = {
  en_service: "En service",
  atelier: "À l'atelier",
  hors_service: "Hors service",
  vendu: "Vendu",
};

export const REPAIR_STATUS_LABELS: Record<string, string> = {
  a_diagnostiquer: "À diagnostiquer",
  a_planifier: "À planifier",
  planifiee: "Planifiée",
  en_reparation: "En réparation",
  terminee: "Terminée",
};

export const PRIORITY_LABELS: Record<string, string> = {
  urgente: "Urgent",
  elevee: "Élevé",
  importante: "Élevé", // ancienne valeur conservée pour l'historique
  normale: "Normal",
  faible: "Faible",
};

/** Choix proposés dans les formulaires (l'ancienne valeur « importante » reste lisible). */
export const PRIORITY_OPTIONS = [
  { value: "urgente", label: "Urgent" },
  { value: "elevee", label: "Élevé" },
  { value: "normale", label: "Normal" },
  { value: "faible", label: "Faible" },
];

export const PRIORITY_RANK: Record<string, number> = {
  urgente: 0, elevee: 1, importante: 1, normale: 2, faible: 3,
};

export const INSPECTION_POINTS = [
  { key: "huile", label: "Huile" },
  { key: "pneus", label: "Pneus" },
  { key: "air", label: "Air" },
  { key: "lumieres", label: "Lumières" },
  { key: "freins", label: "Freins" },
  { key: "fuites", label: "Fuites" },
  { key: "dompe", label: "Dompe" },
  { key: "hydraulique", label: "Hydraulique" },
] as const;

export type CheckValue = "ok" | "surveiller" | "probleme";

export const CHECK_LABELS: Record<CheckValue, string> = {
  ok: "OK",
  surveiller: "À surveiller",
  probleme: "Problème",
};

export const vehicleLabel = (v?: Vehicle | null) =>
  !v ? "—" : [v.unit_number ? `#${v.unit_number}` : null, v.name].filter(Boolean).join(" · ");

export const money = (n: number | null | undefined) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })
    .format(Number(n || 0));

export const dateLabel = (d: string | null | undefined) =>
  !d ? "—" : new Date(d.length <= 10 ? `${d}T12:00:00` : d)
    .toLocaleDateString("fr-CA", { day: "numeric", month: "short", year: "numeric" });

// ---------------- Lectures ----------------

export async function fetchVehicles(): Promise<Vehicle[]> {
  const { data, error } = await supabase.from("trucks").select("*").order("name");
  if (error) throw error;
  return data ?? [];
}

export async function fetchMaintenance(vehicleId?: string): Promise<Maintenance[]> {
  let q = supabase.from("fleet_maintenance").select("*").order("performed_on", { ascending: false });
  if (vehicleId) q = q.eq("vehicle_id", vehicleId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function fetchRepairs(vehicleId?: string): Promise<Repair[]> {
  let q = supabase.from("fleet_repairs").select("*").order("reported_on", { ascending: false });
  if (vehicleId) q = q.eq("vehicle_id", vehicleId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function fetchInspections(vehicleId?: string): Promise<Inspection[]> {
  let q = supabase.from("fleet_inspections").select("*").order("inspected_on", { ascending: false });
  if (vehicleId) q = q.eq("vehicle_id", vehicleId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function fetchParts(vehicleId?: string): Promise<Part[]> {
  let q = supabase.from("fleet_parts").select("*").order("installed_on", { ascending: false });
  if (vehicleId) q = q.eq("vehicle_id", vehicleId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function fetchCosts(vehicleId?: string): Promise<Cost[]> {
  let q = supabase.from("fleet_costs").select("*").order("incurred_on", { ascending: false });
  if (vehicleId) q = q.eq("vehicle_id", vehicleId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/** Événements du calendrier administratif existant liés à la flotte. */
export async function fetchFleetEvents(vehicleId?: string): Promise<FleetEvent[]> {
  let q = supabase.from("calendar_events").select("*").not("fleet_ref_type", "is", null)
    .order("start_at", { ascending: true });
  if (vehicleId) q = q.eq("vehicle_id", vehicleId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// ---------------- Écritures ----------------

export async function saveVehicle(v: Partial<Vehicle> & { name: string }) {
  if (v.id) {
    const { error } = await supabase.from("trucks").update(v).eq("id", v.id);
    if (error) throw error;
    await logChange("fleet_vehicle", v.id, "update");
    return v.id;
  }
  const { data, error } = await supabase.from("trucks").insert(v as never).select("id").single();
  if (error) throw error;
  await logChange("fleet_vehicle", data.id as string, "create");
  return data.id as string;
}

/**
 * Crée (ou met à jour) l'événement correspondant DANS LE CALENDRIER EXISTANT.
 * Aucun second calendrier : on écrit dans `calendar_events`.
 */
export async function syncCalendarEvent(opts: {
  eventId?: string | null;
  vehicleId: string;
  refType: "entretien" | "reparation" | "inspection" | "echeance";
  refId: string;
  title: string;
  date: string; // yyyy-mm-dd
  notes?: string | null;
}): Promise<string> {
  const start = new Date(`${opts.date}T08:00:00`);
  const end = new Date(`${opts.date}T09:00:00`);
  const payload = {
    title: opts.title,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    status: "a_planifier" as const,
    truck_id: opts.vehicleId,
    vehicle_id: opts.vehicleId,
    fleet_ref_type: opts.refType,
    fleet_ref_id: opts.refId,
    admin_notes: opts.notes ?? null,
  };
  if (opts.eventId) {
    const { error } = await supabase.from("calendar_events").update(payload).eq("id", opts.eventId);
    if (error) throw error;
    return opts.eventId;
  }
  const { data, error } = await supabase.from("calendar_events").insert(payload as never)
    .select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function saveMaintenance(m: Partial<Maintenance> & { vehicle_id: string }) {
  let id = m.id;
  if (id) {
    await logChange("fleet_maintenance", id, "update");
    const { error } = await supabase.from("fleet_maintenance").update(m).eq("id", id);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from("fleet_maintenance").insert(m as never)
      .select("id").single();
    if (error) throw error;
    id = data.id as string;
  }
  if (m.next_due_date) {
    const eventId = await syncCalendarEvent({
      eventId: m.calendar_event_id,
      vehicleId: m.vehicle_id,
      refType: "entretien",
      refId: id!,
      title: `Entretien — ${m.next_type || m.maintenance_type || "préventif"}`,
      date: m.next_due_date,
      notes: m.notes ?? null,
    });
    await supabase.from("fleet_maintenance").update({ calendar_event_id: eventId }).eq("id", id!);
  }
  return id!;
}

export async function saveRepair(r: Partial<Repair> & { vehicle_id: string; problem: string }) {
  let id = r.id;
  if (id) {
    await logChange("fleet_repair", id, "update");
    const { error } = await supabase.from("fleet_repairs").update(r).eq("id", id);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from("fleet_repairs").insert(r as never)
      .select("id").single();
    if (error) throw error;
    id = data.id as string;
  }
  if (r.scheduled_date) {
    const eventId = await syncCalendarEvent({
      eventId: r.calendar_event_id,
      vehicleId: r.vehicle_id,
      refType: "reparation",
      refId: id!,
      title: `Réparation — ${r.problem}`,
      date: r.scheduled_date,
      notes: r.description ?? null,
    });
    await supabase.from("fleet_repairs").update({ calendar_event_id: eventId }).eq("id", id!);
  }
  return id!;
}

export async function saveInspection(i: Partial<Inspection> & { vehicle_id: string }) {
  const checks = (i.checks ?? {}) as Record<string, CheckValue>;
  const hasProblem = Object.values(checks).some((v) => v === "probleme");
  const payload = { ...i, has_problem: hasProblem };
  let id = i.id;
  if (id) {
    await logChange("fleet_inspection", id, "update");
    const { error } = await supabase.from("fleet_inspections").update(payload).eq("id", id);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from("fleet_inspections").insert(payload as never)
      .select("id").single();
    if (error) throw error;
    id = data.id as string;
  }
  if (hasProblem) await createRepairsFromInspection(id!);
  return id!;
}

/**
 * Crée automatiquement une réparation « à planifier » pour chaque point
 * marqué PROBLÈME lors d'une inspection (sans jamais créer de doublon).
 */
export async function createRepairsFromInspection(inspectionId: string) {
  const { data: insp } = await supabase.from("fleet_inspections").select("*").eq("id", inspectionId).maybeSingle();
  if (!insp) return 0;
  const checks = (insp.checks ?? {}) as Record<string, CheckValue>;
  const problems = INSPECTION_POINTS.filter((p) => checks[p.key] === "probleme");
  if (!problems.length) return 0;
  const { data: existing } = await supabase.from("fleet_repairs").select("problem").eq("inspection_id", inspectionId);
  const already = new Set((existing ?? []).map((r) => r.problem));
  let created = 0;
  for (const p of problems) {
    const problem = `Inspection — ${p.label}`;
    if (already.has(problem)) continue;
    await saveRepair({
      vehicle_id: insp.vehicle_id,
      problem,
      description: insp.comment,
      odometer_km: insp.odometer_km,
      reported_on: insp.inspected_on,
      priority: "elevee",
      status: "a_planifier",
      inspection_id: inspectionId,
    } as never);
    created += 1;
  }
  return created;
}

/** Transforme un problème d'inspection en réparation à planifier. */
export async function inspectionToRepair(insp: Inspection, problem: string) {
  return saveRepair({
    vehicle_id: insp.vehicle_id,
    problem,
    description: insp.comment,
    odometer_km: insp.odometer_km,
    reported_on: insp.inspected_on,
    priority: "elevee",
    status: "a_planifier",
    inspection_id: insp.id,
  });
}

export async function deleteRow(table: "fleet_maintenance" | "fleet_repairs" | "fleet_inspections" | "fleet_parts", id: string) {
  const owners: Record<string, FleetOwnerType> = {
    fleet_maintenance: "fleet_maintenance", fleet_repairs: "fleet_repair",
    fleet_inspections: "fleet_inspection", fleet_parts: "fleet_vehicle",
  };
  await logChange(owners[table], id, "delete");
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
}

/** Balayage des échéances (entretien bientôt dû / en retard) → notifications existantes. */
export async function scanDue() {
  const { data, error } = await supabase.rpc("fleet_scan_due");
  if (error) throw error;
  return data;
}

// ---------------- Agrégations ----------------

export type TodoItem = {
  id: string;
  kind: "entretien" | "reparation" | "inspection";
  vehicleId: string;
  work: string;
  date: string | null;
  km: number | null;
  priority: string;
  status: string;
  late: boolean;
};

export function buildTodo(maint: Maintenance[], repairs: Repair[], inspections: Inspection[]): TodoItem[] {
  const today = new Date().toISOString().slice(0, 10);
  const items: TodoItem[] = [];

  for (const m of maint) {
    if (!m.next_due_date && !m.next_due_km && !m.next_due_hours) continue;
    const late = !!m.next_due_date && m.next_due_date < today;
    items.push({
      id: m.id, kind: "entretien", vehicleId: m.vehicle_id,
      work: m.next_type || m.maintenance_type || "Entretien préventif",
      date: m.next_due_date, km: m.next_due_km ? Number(m.next_due_km) : null,
      priority: late ? "urgente" : "normale",
      status: late ? "En retard" : "À venir", late,
    });
  }
  for (const r of repairs) {
    if (r.status === "terminee") continue;
    const late = !!r.scheduled_date && r.scheduled_date < today;
    items.push({
      id: r.id, kind: "reparation", vehicleId: r.vehicle_id, work: r.problem,
      date: r.scheduled_date, km: r.odometer_km ? Number(r.odometer_km) : null,
      priority: r.priority, status: REPAIR_STATUS_LABELS[r.status] ?? r.status, late,
    });
  }
  const converted = new Set(repairs.map((r) => r.inspection_id).filter(Boolean) as string[]);
  for (const i of inspections) {
    // Un problème déjà transformé en réparation n'apparaît qu'une seule fois.
    if (!i.has_problem || converted.has(i.id)) continue;
    items.push({
      id: i.id, kind: "inspection", vehicleId: i.vehicle_id,
      work: i.comment || "Problème signalé à l'inspection",
      date: i.inspected_on, km: i.odometer_km ? Number(i.odometer_km) : null,
      priority: "elevee", status: "À traiter", late: false,
    });
  }

  const rank = PRIORITY_RANK;
  return items.sort((a, b) => {
    if (a.late !== b.late) return a.late ? -1 : 1;
    if (rank[a.priority] !== rank[b.priority]) return (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3);
    return (a.date ?? "9999").localeCompare(b.date ?? "9999");
  });
}

export function costTotals(costs: Cost[]) {
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const year = String(now.getFullYear());
  let total = 0, thisMonth = 0, thisYear = 0;
  for (const c of costs) {
    const amount = Number(c.amount || 0);
    total += amount;
    if (c.incurred_on?.startsWith(month)) thisMonth += amount;
    if (c.incurred_on?.startsWith(year)) thisYear += amount;
  }
  return { total, thisMonth, thisYear };
}


// ---------------- Documents (réutilise `crm_documents` + bucket `crm-docs`) ----------------

export type FleetOwnerType = "fleet_vehicle" | "fleet_maintenance" | "fleet_repair" | "fleet_inspection";

export interface FleetDocument {
  id: string;
  owner_type: string;
  owner_id: string;
  kind: string;
  title: string | null;
  url: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export async function fetchDocuments(ownerType: FleetOwnerType, ownerId: string): Promise<FleetDocument[]> {
  const { data, error } = await supabase
    .from("crm_documents")
    .select("id, owner_type, owner_id, kind, title, url, mime_type, size_bytes, created_at")
    .eq("owner_type", ownerType)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FleetDocument[];
}

export async function uploadDocument(ownerType: FleetOwnerType, ownerId: string, file: File, kind = "document") {
  const safe = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `flotte/${ownerType}/${ownerId}/${Date.now()}-${safe}`;
  const { error: upErr } = await supabase.storage.from("crm-docs").upload(path, file, { upsert: false });
  if (upErr) throw upErr;
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from("crm_documents").insert({
    owner_type: ownerType,
    owner_id: ownerId,
    kind,
    title: file.name,
    url: path,
    mime_type: file.type || null,
    size_bytes: file.size,
    uploaded_by: userData.user?.id ?? null,
  } as never);
  if (error) throw error;
}

export async function documentLink(doc: FleetDocument) {
  if (/^https?:\/\//.test(doc.url)) return doc.url;
  const { data, error } = await supabase.storage.from("crm-docs").createSignedUrl(doc.url, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteDocument(doc: FleetDocument) {
  if (!/^https?:\/\//.test(doc.url)) {
    await supabase.storage.from("crm-docs").remove([doc.url]);
  }
  const { error } = await supabase.from("crm_documents").delete().eq("id", doc.id);
  if (error) throw error;
}

/** Suppression d'un véhicule : refusée si de l'historique existe (jamais de perte de données). */
export async function deleteVehicle(id: string) {
  const [m, r, i] = await Promise.all([
    supabase.from("fleet_maintenance").select("id", { count: "exact", head: true }).eq("vehicle_id", id),
    supabase.from("fleet_repairs").select("id", { count: "exact", head: true }).eq("vehicle_id", id),
    supabase.from("fleet_inspections").select("id", { count: "exact", head: true }).eq("vehicle_id", id),
  ]);
  const total = (m.count ?? 0) + (r.count ?? 0) + (i.count ?? 0);
  if (total > 0) {
    throw new Error("Ce véhicule possède un historique. Passez plutôt son statut à « Hors service » ou « Vendu ».");
  }
  const { error } = await supabase.from("trucks").delete().eq("id", id);
  if (error) throw error;
}

/** Mise à jour rapide du kilométrage / des heures moteur. */
export async function updateVehicleReadings(
  id: string,
  odometerKm: number | null,
  engineHours: number | null,
  writeLog = true,
) {
  const { data: before } = await supabase.from("trucks")
    .select("odometer_km, engine_hours").eq("id", id).maybeSingle();
  const patch: Record<string, number> = {};
  if (odometerKm != null) patch.odometer_km = odometerKm;
  if (engineHours != null) patch.engine_hours = engineHours;
  if (!Object.keys(patch).length) return;
  const { error } = await supabase.from("trucks").update(patch as never).eq("id", id);
  if (error) throw error;
  if (!writeLog) return;
  if (odometerKm != null && Number(before?.odometer_km ?? -1) !== odometerKm) {
    await logChange("fleet_vehicle", id, "update", "Kilométrage",
      before?.odometer_km != null ? `${Number(before.odometer_km).toLocaleString("fr-CA")} km` : null,
      `${odometerKm.toLocaleString("fr-CA")} km`);
  }
  if (engineHours != null && Number(before?.engine_hours ?? -1) !== engineHours) {
    await logChange("fleet_vehicle", id, "update", "Heures moteur",
      before?.engine_hours ?? null, engineHours);
  }
}


// ---------------- Journal des modifications (réutilise `crm_audit_log`) ----------------

export interface FleetLogEntry {
  id: string;
  owner_type: string;
  owner_id: string;
  action: string;
  field: string | null;
  old_value: unknown;
  new_value: unknown;
  actor_email: string | null;
  created_at: string;
}

/** Écrit une ligne dans le journal existant du CRM (jamais de second journal). */
export async function logChange(
  ownerType: FleetOwnerType,
  ownerId: string,
  action: "create" | "update" | "delete",
  field?: string | null,
  oldValue?: unknown,
  newValue?: unknown,
) {
  const { data: userData } = await supabase.auth.getUser();
  await supabase.from("crm_audit_log").insert({
    owner_type: ownerType,
    owner_id: ownerId,
    action,
    field: field ?? null,
    old_value: (oldValue ?? null) as never,
    new_value: (newValue ?? null) as never,
    actor_id: userData.user?.id ?? null,
    actor_email: userData.user?.email ?? null,
  } as never);
}

export async function fetchChangeLog(ownerIds: string[]): Promise<FleetLogEntry[]> {
  if (!ownerIds.length) return [];
  const { data, error } = await supabase
    .from("crm_audit_log")
    .select("id, owner_type, owner_id, action, field, old_value, new_value, actor_email, created_at")
    .in("owner_id", ownerIds)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as FleetLogEntry[];
}

const OWNER_LABELS: Record<string, string> = {
  fleet_vehicle: "Véhicule",
  fleet_maintenance: "Entretien",
  fleet_repair: "Réparation",
  fleet_inspection: "Inspection",
};

/** Phrase lisible pour le journal, ex. « Kilométrage modifié de 428 500 à 429 120 ». */
export function logSentence(e: FleetLogEntry) {
  const subject = OWNER_LABELS[e.owner_type] ?? "Élément";
  if (e.field && e.action === "update") {
    const from = e.old_value == null || e.old_value === "" ? "—" : String(e.old_value);
    const to = e.new_value == null || e.new_value === "" ? "—" : String(e.new_value);
    return `${e.field} modifié de ${from} à ${to}`;
  }
  if (e.action === "create") return `${subject} ajouté`;
  if (e.action === "delete") return `${subject} supprimé`;
  return `${subject} modifié`;
}

// ---------------- Marquer comme terminé ----------------

export interface CompletionInput {
  date: string;
  odometerKm: number | null;
  engineHours: number | null;
  cost: number | null;
  notes: string | null;
  /** Prochaine échéance (facultative) pour un entretien. */
  nextType?: string | null;
  nextDate?: string | null;
  nextKm?: number | null;
  nextHours?: number | null;
}

/** Réparation terminée → statut, historique, coûts, alerte fermée, relevés du véhicule. */
export async function completeRepair(repair: Repair, input: CompletionInput) {
  const { error } = await supabase.from("fleet_repairs").update({
    status: "terminee",
    completed_date: input.date,
    cost_actual: input.cost,
    odometer_km: input.odometerKm ?? repair.odometer_km,
    completed_engine_hours: input.engineHours,
    notes: input.notes ?? repair.notes,
  } as never).eq("id", repair.id);
  if (error) throw error;
  if (repair.calendar_event_id) {
    await supabase.from("calendar_events").update({ status: "termine" } as never).eq("id", repair.calendar_event_id);
  }
  await updateVehicleReadings(repair.vehicle_id, input.odometerKm, input.engineHours, false);
  // L'alerte se referme automatiquement (déclencheur `fleet_notify_repair`).
  await logChange("fleet_repair", repair.id, "update", "Statut", REPAIR_STATUS_LABELS[repair.status], "Terminée");
}

/**
 * Entretien terminé : l'intervention réalisée est enregistrée, l'échéance
 * précédente est fermée et la prochaine échéance (si fournie) est recréée
 * dans le calendrier existant.
 */
export async function completeMaintenance(m: Maintenance, input: CompletionInput) {
  const { error } = await supabase.from("fleet_maintenance").update({
    performed_on: input.date,
    odometer_km: input.odometerKm ?? m.odometer_km,
    engine_hours: input.engineHours ?? m.engine_hours,
    completed_engine_hours: input.engineHours,
    cost: input.cost ?? m.cost,
    notes: input.notes ?? m.notes,
    next_due_date: null,
    next_due_km: null,
    next_due_hours: null,
  } as never).eq("id", m.id);
  if (error) throw error;
  if (m.calendar_event_id) {
    await supabase.from("calendar_events").update({ status: "termine" } as never).eq("id", m.calendar_event_id);
  }
  await updateVehicleReadings(m.vehicle_id, input.odometerKm, input.engineHours, false);
  // L'alerte se referme lors du balayage des échéances (`fleet_scan_due`).
  await logChange("fleet_maintenance", m.id, "update", "Statut", "À faire", "Terminé");

  if (input.nextDate || input.nextKm || input.nextHours) {
    const nextId = await saveMaintenance({
      vehicle_id: m.vehicle_id,
      maintenance_type: input.nextType || m.next_type || m.maintenance_type,
      performed_on: null,
      next_type: input.nextType || m.next_type || m.maintenance_type,
      next_due_date: input.nextDate || null,
      next_due_km: input.nextKm ?? null,
      next_due_hours: input.nextHours ?? null,
      cost: 0,
      alert_days_before: m.alert_days_before,
      alert_km_margin: m.alert_km_margin,
      alert_hours_margin: m.alert_hours_margin,
    } as never);
    await logChange("fleet_maintenance", nextId, "create");
  }
  await scanDue().catch(() => undefined);
}
