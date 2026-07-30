// ============================================================
// Vrac Québec OS — Centre des Opérations
// Ce fichier ne contient AUCUNE logique métier de calcul :
// il déclare le cycle de vie, les statuts et les accès aux données.
// Les décisions viennent du Decision Engine, les montants du
// Calculation Engine (supabase/functions/_shared/vqos).
// ============================================================
import { supabase } from "@/integrations/supabase/client";

export const DELIVERY_LIFECYCLE = [
  { value: "a_planifier", label: "À planifier", color: "#94a3b8" },
  { value: "planifiee", label: "Planifiée", color: "#3b82f6" },
  { value: "en_chargement", label: "En chargement", color: "#f59e0b" },
  { value: "en_livraison", label: "En livraison", color: "#8b5cf6" },
  { value: "livree", label: "Livrée", color: "#7ED321" },
  { value: "facturee", label: "Facturée", color: "#0ea5e9" },
  { value: "terminee", label: "Terminée", color: "#16a34a" },
  { value: "annulee", label: "Annulée", color: "#ef4444" },
] as const;

/** Cycle officiel complet, du premier contact à la clôture du dossier. */
export const FULL_LIFECYCLE = [
  "Nouvelle demande", "Estimation", "Soumission", "Soumission acceptée",
  "À planifier", "Planifiée", "En chargement", "En livraison",
  "Livrée", "Facturée", "Terminée",
];

export const OPS_PRIORITIES = [
  { value: "basse", label: "Basse", color: "#94a3b8" },
  { value: "normale", label: "Normale", color: "#3b82f6" },
  { value: "haute", label: "Haute", color: "#f59e0b" },
  { value: "urgente", label: "Urgente", color: "#ef4444" },
];

export const TRUCK_STATUSES = [
  { value: "disponible", label: "Disponible", color: "#7ED321" },
  { value: "reserve", label: "Réservé", color: "#3b82f6" },
  { value: "en_chargement", label: "En chargement", color: "#f59e0b" },
  { value: "en_livraison", label: "En livraison", color: "#8b5cf6" },
  { value: "retour", label: "Retour", color: "#0ea5e9" },
  { value: "entretien", label: "Entretien", color: "#a855f7" },
  { value: "hors_service", label: "Hors service", color: "#ef4444" },
];

export const DRIVER_STATUSES = [
  { value: "disponible", label: "Disponible", color: "#7ED321" },
  { value: "occupe", label: "Occupé", color: "#f59e0b" },
  { value: "inactif", label: "Inactif", color: "#94a3b8" },
];

export const INCIDENT_TYPES = [
  { value: "retard", label: "Retard" },
  { value: "panne", label: "Camion en panne" },
  { value: "adresse", label: "Erreur d'adresse" },
  { value: "absence_client", label: "Absence du client" },
  { value: "retour_chargement", label: "Retour au chargement" },
  { value: "annulation", label: "Commande annulée" },
  { value: "autre", label: "Autre incident" },
];

export const INCIDENT_SEVERITIES = [
  { value: "faible", label: "Faible" },
  { value: "moyenne", label: "Moyenne" },
  { value: "elevee", label: "Élevée" },
  { value: "critique", label: "Critique" },
];

export const statusMeta = (v?: string | null) =>
  DELIVERY_LIFECYCLE.find((s) => s.value === v) ?? DELIVERY_LIFECYCLE[0];
export const priorityMeta = (v?: string | null) =>
  OPS_PRIORITIES.find((s) => s.value === v) ?? OPS_PRIORITIES[1];
export const truckStatusMeta = (v?: string | null) =>
  TRUCK_STATUSES.find((s) => s.value === v) ?? TRUCK_STATUSES[0];

export interface Delivery {
  id: string;
  company_id: string | null;
  delivery_number: string | null;
  order_id: string | null;
  project_id: string | null;
  client_id: string | null;
  material_id: string | null;
  supplier_id: string | null;
  pickup_location_id: string | null;
  carrier_id: string | null;
  truck_id: string | null;
  driver_id: string | null;
  quantity: number | null;
  quantity_unit: string | null;
  delivery_address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  duration_minutes: number | null;
  priority: string;
  status: string;
  group_key: string | null;
  distance_km: number | null;
  estimated_cost: number | null;
  notes: string | null;
  internal_notes: string | null;
  created_at: string;
}

export interface OpsRefs {
  clients: { id: string; name: string; city: string | null; latitude: number | null; longitude: number | null }[];
  projects: { id: string; name: string; project_number: string | null; client_id: string | null }[];
  materials: { id: string; name: string }[];
  suppliers: { id: string; name: string; latitude: number | null; longitude: number | null }[];
  pickups: { id: string; name: string; supplier_id: string | null; latitude: number | null; longitude: number | null }[];
  carriers: { id: string; name: string; priority: number | null; availability: string | null }[];
  trucks: {
    id: string; name: string; capacity_tonnes: number | null; operational_status: string;
    company_id: string | null; is_active: boolean | null;
  }[];
  drivers: {
    id: string; first_name: string; last_name: string | null; phone: string | null;
    status: string | null; schedule: string | null; default_truck_id: string | null;
  }[];
}

const EMPTY_REFS: OpsRefs = {
  clients: [], projects: [], materials: [], suppliers: [], pickups: [],
  carriers: [], trucks: [], drivers: [],
};

export const emptyRefs = () => ({ ...EMPTY_REFS });

/* eslint-disable @typescript-eslint/no-explicit-any */
const scoped = (q: any, companyId?: string | null) => (companyId ? q.eq("company_id", companyId) : q);
const from = (table: string) => supabase.from(table as never) as any;

export async function fetchOpsRefs(companyId?: string | null): Promise<OpsRefs> {
  const [clients, projects, materials, suppliers, pickups, carriers, trucks, drivers] = await Promise.all([
    scoped(from("jsc_clients").select("id,name,city,latitude,longitude").is("archived_at", null), companyId),
    scoped(from("jsc_projects").select("id,name,project_number,client_id").is("archived_at", null), companyId),
    scoped(from("jsc_materials").select("id,name").is("archived_at", null), companyId),
    scoped(from("jsc_suppliers").select("id,name,latitude,longitude").is("archived_at", null), companyId),
    scoped(from("jsc_pickup_locations").select("id,name,supplier_id,latitude,longitude").is("archived_at", null), companyId),
    from("jsc_companies").select("id,name,priority,availability").is("archived_at", null),
    scoped(from("jsc_trucks").select("id,name,capacity_tonnes,operational_status,company_id,is_active").is("archived_at", null), companyId),
    scoped(from("jsc_drivers").select("id,first_name,last_name,phone,status,schedule,default_truck_id").is("archived_at", null), companyId),
  ]);
  return {
    clients: (clients.data as OpsRefs["clients"]) ?? [],
    projects: (projects.data as OpsRefs["projects"]) ?? [],
    materials: (materials.data as OpsRefs["materials"]) ?? [],
    suppliers: (suppliers.data as OpsRefs["suppliers"]) ?? [],
    pickups: (pickups.data as OpsRefs["pickups"]) ?? [],
    carriers: (carriers.data as OpsRefs["carriers"]) ?? [],
    trucks: (trucks.data as OpsRefs["trucks"]) ?? [],
    drivers: (drivers.data as OpsRefs["drivers"]) ?? [],
  };
}

export async function fetchDeliveries(companyId?: string | null): Promise<Delivery[]> {
  const q = from("jsc_deliveries")
    .select("*")
    .is("archived_at", null)
    .order("scheduled_date", { ascending: true, nullsFirst: false })
    .order("scheduled_time", { ascending: true, nullsFirst: true })
    .limit(2000);
  const { data, error } = await scoped(q, companyId);
  if (error) throw error;
  return (data as unknown as Delivery[]) ?? [];
}

export async function updateDelivery(id: string, patch: Record<string, unknown>) {
  const { error } = await from("jsc_deliveries").update(patch).eq("id", id);
  if (error) throw error;
}

export async function notify(params: {
  companyId?: string | null; audience: "client" | "repartiteur" | "administrateur";
  title: string; body?: string; entityType?: string; entityId?: string;
}) {
  await from("jsc_notifications").insert({
    company_id: params.companyId ?? null,
    audience: params.audience,
    channel: "interne",
    title: params.title,
    body: params.body ?? null,
    entity_type: params.entityType ?? null,
    entity_id: params.entityId ?? null,
    status: "envoyee",
    sent_at: new Date().toISOString(),
  });
}

/** Distance à vol d'oiseau (km) — utilisée uniquement pour trier des suggestions. */
export function haversineKm(
  a: { latitude?: number | null; longitude?: number | null },
  b: { latitude?: number | null; longitude?: number | null },
): number | null {
  if (!a?.latitude || !a?.longitude || !b?.latitude || !b?.longitude) return null;
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.latitude * Math.PI) / 180) * Math.cos((b.latitude * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)) * 10) / 10;
}

export interface DispatchSuggestion {
  carrierId: string | null;
  truckId: string | null;
  driverId: string | null;
  pickupId: string | null;
  distanceKm: number | null;
  rationale: string[];
}

/**
 * Suggestion de répartition : disponibilité, capacité, distance et priorité
 * administrative. Le répartiteur conserve toujours le dernier mot.
 */
export function suggestDispatch(
  delivery: Delivery,
  refs: OpsRefs,
  busyTruckIds: Set<string>,
  busyDriverIds: Set<string>,
): DispatchSuggestion {
  const rationale: string[] = [];

  const pickup = [...refs.pickups]
    .map((p) => ({ p, d: haversineKm(p, delivery) }))
    .sort((a, b) => (a.d ?? 9999) - (b.d ?? 9999))[0];
  if (pickup?.p) {
    rationale.push(
      pickup.d != null
        ? `Lieu de chargement le plus proche : ${pickup.p.name} (${pickup.d} km).`
        : `Lieu de chargement retenu : ${pickup.p.name}.`,
    );
  }

  const needed = Number(delivery.quantity ?? 0);
  const truck = refs.trucks
    .filter((t) => t.is_active !== false && !busyTruckIds.has(t.id))
    .filter((t) => ["disponible", "retour"].includes(t.operational_status))
    .sort((a, b) => {
      const ca = Number(a.capacity_tonnes ?? 0);
      const cb = Number(b.capacity_tonnes ?? 0);
      const fitA = needed && ca >= needed ? ca - needed : 999 - ca;
      const fitB = needed && cb >= needed ? cb - needed : 999 - cb;
      return fitA - fitB;
    })[0];
  if (truck) {
    rationale.push(
      needed
        ? `Camion ${truck.name} : capacité ${truck.capacity_tonnes ?? "?"} t pour ${needed} ${delivery.quantity_unit ?? "t"}.`
        : `Camion ${truck.name} disponible.`,
    );
  } else {
    rationale.push("Aucun camion disponible : vérifier la flotte ou reporter l'heure.");
  }

  const driver =
    refs.drivers.find(
      (d) => truck && d.default_truck_id === truck.id && !busyDriverIds.has(d.id) && (d.status ?? "disponible") === "disponible",
    ) ??
    refs.drivers.find((d) => !busyDriverIds.has(d.id) && (d.status ?? "disponible") === "disponible");
  if (driver) rationale.push(`Chauffeur ${driver.first_name} ${driver.last_name ?? ""} disponible.`.trim());

  const carrier = [...refs.carriers]
    .filter((c) => (c.availability ?? "disponible") !== "indisponible")
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
  if (carrier) rationale.push(`Transporteur prioritaire : ${carrier.name}.`);

  return {
    carrierId: carrier?.id ?? null,
    truckId: truck?.id ?? null,
    driverId: driver?.id ?? null,
    pickupId: pickup?.p?.id ?? null,
    distanceKm: pickup?.d ?? null,
    rationale,
  };
}

export const todayISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });

export const money = (v: unknown) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(Number(v ?? 0));
