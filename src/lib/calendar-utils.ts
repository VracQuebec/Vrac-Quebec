import type { Database } from "@/integrations/supabase/types";
import { TRUCK_TYPES as TRUCK_CATALOG, truckTypeLabel } from "@/lib/trucks/catalog";

export type CalendarEvent = Database["public"]["Tables"]["calendar_events"]["Row"];
export type Truck = Database["public"]["Tables"]["trucks"]["Row"];
export type Driver = Database["public"]["Tables"]["drivers"]["Row"];
export type EventStatus = Database["public"]["Enums"]["calendar_event_status"];
export type TruckType = Database["public"]["Enums"]["truck_type"];
export type DriverStatus = Database["public"]["Enums"]["driver_status"];

export const STATUS_LABELS: Record<EventStatus, string> = {
  a_planifier: "À planifier",
  planifie: "Planifié",
  en_cours: "En cours",
  termine: "Terminé",
  reporte: "Reporté",
  annule: "Annulé",
};

export const STATUS_VAR: Record<EventStatus, string> = {
  a_planifier: "--status-a-planifier",
  planifie: "--status-planifie",
  en_cours: "--status-en-cours",
  termine: "--status-termine",
  reporte: "--status-reporte",
  annule: "--status-annule",
};

export const statusBg = (s: EventStatus) => `hsl(var(${STATUS_VAR[s]}))`;
export const statusBgSoft = (s: EventStatus) => `hsl(var(${STATUS_VAR[s]}) / 0.15)`;
export const statusBorder = (s: EventStatus) => `hsl(var(${STATUS_VAR[s]}) / 0.5)`;

/** Libellés issus de la nomenclature centrale (`@/lib/trucks/catalog`). */
export const TRUCK_TYPE_LABELS = Object.fromEntries(
  TRUCK_CATALOG.map((t) => [t.key, truckTypeLabel(t.key)]),
) as Record<TruckType, string>;

export const DRIVER_STATUS_LABELS: Record<DriverStatus, string> = {
  disponible: "Disponible",
  occupe: "Occupé",
  inactif: "Inactif",
};

export const EVENT_STATUSES: EventStatus[] = [
  "a_planifier", "planifie", "en_cours", "termine", "reporte", "annule",
];

export const TRUCK_TYPES: TruckType[] = TRUCK_CATALOG.map((t) => t.key as TruckType);

export const DRIVER_STATUSES: DriverStatus[] = ["disponible", "occupe", "inactif"];

export type CalendarView = "day" | "week" | "month" | "agenda" | "dispatch";

export const VIEW_LABELS: Record<CalendarView, string> = {
  day: "Jour",
  week: "Semaine",
  month: "Mois",
  agenda: "Agenda",
  dispatch: "Répartition",
};

export function formatTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" });
}

export function formatShortDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("fr-CA", { day: "numeric", month: "short" });
}

export function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}