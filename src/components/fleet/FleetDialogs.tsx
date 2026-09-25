// Formulaires rapides du module Gestion de la flotte (back-office).
// Volontairement courts : 4 actions rapides, optimisées iPad / téléphone.
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  CHECK_LABELS, INSPECTION_POINTS, PRIORITY_OPTIONS, REPAIR_STATUS_LABELS,
  SERVICE_STATUS_LABELS, deleteRow, deleteVehicle, saveInspection, saveMaintenance,
  saveRepair, saveVehicle, vehicleLabel,
  type CheckValue, type Inspection, type Maintenance, type Repair, type Vehicle,
} from "@/lib/fleet/api";
import FleetDocuments, { PendingPhotos, uploadPendingDocuments } from "@/components/fleet/FleetDocuments";
import type { Driver } from "@/lib/calendar-utils";
import {
  ADMIN_STATUS, OPS_STATUS, UNIT_CATEGORIES, inspectionPointsFor,
  syncWorkItemsFromInspection, usesEngineHours,
} from "@/lib/fleet/v2";

const TRUCK_TYPES = [
  { value: "10_roues", label: "Camion 10 roues" },
  { value: "12_roues", label: "Camion 12 roues" },
  { value: "semi_remorque", label: "Semi-dompe / remorque" },
  { value: "fardier", label: "Fardier" },
  { value: "6_roues", label: "Camion 6 roues" },
  { value: "autre", label: "Autre équipement lourd" },
];

/** Bouton de suppression avec confirmation (jamais de suppression silencieuse). */
function DeleteButton({ label, onDelete }: { label: string; onDelete: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      className="mr-auto text-destructive hover:text-destructive"
      disabled={busy}
      onClick={async () => {
        if (!window.confirm(`${label}\n\nCette action est définitive. Continuer ?`)) return;
        setBusy(true);
        try { await onDelete(); } finally { setBusy(false); }
      }}
    >
      Supprimer
    </Button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-body text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- Véhicule
export function VehicleDialog({ open, onOpenChange, vehicle, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  vehicle?: Vehicle | null; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [f, setF] = useState<Record<string, string>>({});
  const [section, setSection] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const keys = ["province","color","axles","configuration","capacity","transmission","body_type",
      "body_length","hydraulics","engine_make","engine_model","engine_serial","engine_power",
      "transmission_make","transmission_model","transmission_serial","axle_make","axle_model",
      "axle_ratio","axle_serial","purchase_date","purchase_price","purchase_odometer_km",
      "purchase_hours","vendor","warranty","current_value","acquisition_notes"] as const;
    const extra: Record<string, string> = {};
    for (const k of keys) {
      const value = (vehicle as Record<string, unknown> | null | undefined)?.[k];
      extra[k] = value == null ? "" : String(value);
    }
    setF({
      ...extra,
      name: vehicle?.name ?? "",
      unit_number: vehicle?.unit_number ?? "",
      category: vehicle?.category ?? "camion_12_roues",
      type: vehicle?.type ?? "10_roues",
      make: vehicle?.make ?? "",
      model: vehicle?.model ?? "",
      year: vehicle?.year ? String(vehicle.year) : "",
      plate: vehicle?.plate ?? "",
      vin: vehicle?.vin ?? "",
      odometer_km: vehicle?.odometer_km != null ? String(vehicle.odometer_km) : "",
      engine_hours: vehicle?.engine_hours != null ? String(vehicle.engine_hours) : "",
      admin_status: vehicle?.admin_status ?? "actif",
      ops_status: vehicle?.ops_status ?? "disponible",
      notes: vehicle?.notes ?? "",
    });
  }, [open, vehicle]);

  const save = async () => {
    if (!f.name.trim()) { toast({ title: "Le nom du véhicule est requis", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const num = (k: string) => (f[k] ? Number(f[k]) : null);
      const txt = (k: string) => f[k] || null;
      await saveVehicle({
        id: vehicle?.id,
        name: f.name.trim(),
        unit_number: f.unit_number || null,
        category: f.category,
        type: f.type as Vehicle["type"],
        make: txt("make"), model: txt("model"),
        year: num("year"),
        plate: txt("plate"), vin: txt("vin"),
        province: txt("province"), color: txt("color"),
        axles: num("axles"),
        configuration: txt("configuration"), capacity: txt("capacity"),
        transmission: txt("transmission"), body_type: txt("body_type"), body_length: txt("body_length"),
        hydraulics: txt("hydraulics"),
        engine_make: txt("engine_make"), engine_model: txt("engine_model"),
        engine_serial: txt("engine_serial"), engine_power: txt("engine_power"),
        transmission_make: txt("transmission_make"), transmission_model: txt("transmission_model"),
        transmission_serial: txt("transmission_serial"),
        axle_make: txt("axle_make"), axle_model: txt("axle_model"),
        axle_ratio: txt("axle_ratio"), axle_serial: txt("axle_serial"),
        purchase_date: txt("purchase_date"), purchase_price: num("purchase_price"),
        purchase_odometer_km: num("purchase_odometer_km"), purchase_hours: num("purchase_hours"),
        vendor: txt("vendor"), warranty: txt("warranty"), current_value: num("current_value"),
        acquisition_notes: txt("acquisition_notes"),
        odometer_km: num("odometer_km"),
        engine_hours: num("engine_hours"),
        admin_status: f.admin_status,
        ops_status: f.ops_status,
        // Statut de service historique conservé, aligné sur le statut opérationnel.
        service_status: f.admin_status === "vendu" ? "vendu"
          : f.ops_status === "au_garage" ? "atelier"
          : f.ops_status === "hors_service" ? "hors_service" : "en_service",
        notes: f.notes || null,
      } as never);
      toast({ title: vehicle ? "Véhicule mis à jour" : "Véhicule ajouté" });
      onOpenChange(false); onSaved();
    } catch (e) {
      toast({ title: "Enregistrement impossible", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{vehicle ? "Modifier le véhicule" : "Ajouter un véhicule"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nom / identifiant *"><Input value={f.name ?? ""} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Numéro d'unité"><Input value={f.unit_number ?? ""} onChange={(e) => setF({ ...f, unit_number: e.target.value })} /></Field>
          <Field label="Catégorie d'unité *">
            <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{UNIT_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Type (calendrier)">
            <Select value={f.type} onValueChange={(v) => setF({ ...f, type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TRUCK_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Statut administratif">
            <Select value={f.admin_status} onValueChange={(v) => setF({ ...f, admin_status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ADMIN_STATUS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Statut opérationnel">
            <Select value={f.ops_status} onValueChange={(v) => setF({ ...f, ops_status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{OPS_STATUS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Marque"><Input value={f.make ?? ""} onChange={(e) => setF({ ...f, make: e.target.value })} /></Field>
          <Field label="Modèle"><Input value={f.model ?? ""} onChange={(e) => setF({ ...f, model: e.target.value })} /></Field>
          <Field label="Année"><Input inputMode="numeric" value={f.year ?? ""} onChange={(e) => setF({ ...f, year: e.target.value })} /></Field>
          <Field label="Plaque"><Input value={f.plate ?? ""} onChange={(e) => setF({ ...f, plate: e.target.value })} /></Field>
          <Field label="NIV (VIN)"><Input value={f.vin ?? ""} onChange={(e) => setF({ ...f, vin: e.target.value })} /></Field>
          <Field label="Kilométrage"><Input inputMode="numeric" value={f.odometer_km ?? ""} onChange={(e) => setF({ ...f, odometer_km: e.target.value })} /></Field>
          <Field label="Heures moteur"><Input inputMode="numeric" value={f.engine_hours ?? ""} onChange={(e) => setF({ ...f, engine_hours: e.target.value })} /></Field>
          <Field label="Province"><Input value={f.province ?? ""} onChange={(e) => setF({ ...f, province: e.target.value })} /></Field>
          <Field label="Couleur"><Input value={f.color ?? ""} onChange={(e) => setF({ ...f, color: e.target.value })} /></Field>

          <div className="col-span-2">
            <button type="button" onClick={() => setSection(section === "config" ? null : "config")}
              className="text-sm font-body text-primary">{section === "config" ? "− Configuration" : "+ Configuration"}</button>
          </div>
          {section === "config" && (
            <>
              <Field label="Nombre d'essieux"><Input inputMode="numeric" value={f.axles ?? ""} onChange={(e) => setF({ ...f, axles: e.target.value })} /></Field>
              <Field label="Configuration"><Input value={f.configuration ?? ""} onChange={(e) => setF({ ...f, configuration: e.target.value })} /></Field>
              <Field label="Capacité"><Input value={f.capacity ?? ""} onChange={(e) => setF({ ...f, capacity: e.target.value })} /></Field>
              <Field label="Transmission"><Input value={f.transmission ?? ""} onChange={(e) => setF({ ...f, transmission: e.target.value })} /></Field>
              <Field label="Type de benne"><Input value={f.body_type ?? ""} onChange={(e) => setF({ ...f, body_type: e.target.value })} /></Field>
              <Field label="Longueur de benne"><Input value={f.body_length ?? ""} onChange={(e) => setF({ ...f, body_length: e.target.value })} /></Field>
              <Field label="Système hydraulique / PTO"><Input value={f.hydraulics ?? ""} onChange={(e) => setF({ ...f, hydraulics: e.target.value })} /></Field>
            </>
          )}

          <div className="col-span-2">
            <button type="button" onClick={() => setSection(section === "meca" ? null : "meca")}
              className="text-sm font-body text-primary">{section === "meca" ? "− Identification mécanique" : "+ Identification mécanique"}</button>
          </div>
          {section === "meca" && (
            <>
              <Field label="Moteur — marque"><Input value={f.engine_make ?? ""} onChange={(e) => setF({ ...f, engine_make: e.target.value })} /></Field>
              <Field label="Moteur — modèle"><Input value={f.engine_model ?? ""} onChange={(e) => setF({ ...f, engine_model: e.target.value })} /></Field>
              <Field label="Moteur — n° de série"><Input value={f.engine_serial ?? ""} onChange={(e) => setF({ ...f, engine_serial: e.target.value })} /></Field>
              <Field label="Moteur — puissance"><Input value={f.engine_power ?? ""} onChange={(e) => setF({ ...f, engine_power: e.target.value })} /></Field>
              <Field label="Transmission — marque"><Input value={f.transmission_make ?? ""} onChange={(e) => setF({ ...f, transmission_make: e.target.value })} /></Field>
              <Field label="Transmission — modèle"><Input value={f.transmission_model ?? ""} onChange={(e) => setF({ ...f, transmission_model: e.target.value })} /></Field>
              <Field label="Transmission — n° de série"><Input value={f.transmission_serial ?? ""} onChange={(e) => setF({ ...f, transmission_serial: e.target.value })} /></Field>
              <Field label="Essieux — marque"><Input value={f.axle_make ?? ""} onChange={(e) => setF({ ...f, axle_make: e.target.value })} /></Field>
              <Field label="Essieux — modèle"><Input value={f.axle_model ?? ""} onChange={(e) => setF({ ...f, axle_model: e.target.value })} /></Field>
              <Field label="Essieux — ratio"><Input value={f.axle_ratio ?? ""} onChange={(e) => setF({ ...f, axle_ratio: e.target.value })} /></Field>
              <Field label="Essieux — n° de série"><Input value={f.axle_serial ?? ""} onChange={(e) => setF({ ...f, axle_serial: e.target.value })} /></Field>
            </>
          )}

          <div className="col-span-2">
            <button type="button" onClick={() => setSection(section === "achat" ? null : "achat")}
              className="text-sm font-body text-primary">{section === "achat" ? "− Acquisition" : "+ Acquisition"}</button>
          </div>
          {section === "achat" && (
            <>
              <Field label="Date d'achat"><Input type="date" value={f.purchase_date ?? ""} onChange={(e) => setF({ ...f, purchase_date: e.target.value })} /></Field>
              <Field label="Prix d'achat"><Input inputMode="decimal" value={f.purchase_price ?? ""} onChange={(e) => setF({ ...f, purchase_price: e.target.value })} /></Field>
              <Field label="Km à l'achat"><Input inputMode="numeric" value={f.purchase_odometer_km ?? ""} onChange={(e) => setF({ ...f, purchase_odometer_km: e.target.value })} /></Field>
              <Field label="Heures à l'achat"><Input inputMode="numeric" value={f.purchase_hours ?? ""} onChange={(e) => setF({ ...f, purchase_hours: e.target.value })} /></Field>
              <Field label="Vendeur"><Input value={f.vendor ?? ""} onChange={(e) => setF({ ...f, vendor: e.target.value })} /></Field>
              <Field label="Garantie"><Input value={f.warranty ?? ""} onChange={(e) => setF({ ...f, warranty: e.target.value })} /></Field>
              <Field label="Valeur actuelle"><Input inputMode="decimal" value={f.current_value ?? ""} onChange={(e) => setF({ ...f, current_value: e.target.value })} /></Field>
              <div className="col-span-2">
                <Field label="Notes d'acquisition"><Textarea rows={2} value={f.acquisition_notes ?? ""} onChange={(e) => setF({ ...f, acquisition_notes: e.target.value })} /></Field>
              </div>
            </>
          )}

          <div className="col-span-2">
            <Field label="Notes"><Textarea rows={2} value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          </div>
          {vehicle && <div className="col-span-2"><FleetDocuments ownerType="fleet_vehicle" ownerId={vehicle.id} /></div>}
        </div>
        <DialogFooter>
          {vehicle && (
            <DeleteButton
              label="Supprimer ce véhicule ?"
              onDelete={async () => {
                try {
                  await deleteVehicle(vehicle.id);
                  toast({ title: "Véhicule supprimé" });
                  onOpenChange(false); onSaved();
                } catch (e) {
                  toast({ title: "Suppression impossible", description: (e as Error).message, variant: "destructive" });
                }
              }}
            />
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={save} disabled={busy}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Entretien
export function MaintenanceDialog({ open, onOpenChange, vehicles, vehicleId, record, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; vehicles: Vehicle[];
  vehicleId?: string; record?: Maintenance | null; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [f, setF] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!open) return;
    setF({
      vehicle_id: record?.vehicle_id ?? vehicleId ?? vehicles[0]?.id ?? "",
      performed_on: record?.performed_on ?? today,
      odometer_km: record?.odometer_km != null ? String(record.odometer_km) : "",
      engine_hours: record?.engine_hours != null ? String(record.engine_hours) : "",
      maintenance_type: record?.maintenance_type ?? "Changement d'huile",
      work_done: record?.work_done ?? "",
      parts_summary: record?.parts_summary ?? "",
      supplier: record?.supplier ?? "",
      cost: record?.cost != null ? String(record.cost) : "",
      next_type: record?.next_type ?? "",
      next_due_date: record?.next_due_date ?? "",
      next_due_km: record?.next_due_km != null ? String(record.next_due_km) : "",
      next_due_hours: record?.next_due_hours != null ? String(record.next_due_hours) : "",
      alert_days_before: String(record?.alert_days_before ?? 14),
      alert_km_margin: String(record?.alert_km_margin ?? 2000),
      alert_hours_margin: String(record?.alert_hours_margin ?? 100),
      notes: record?.notes ?? "",
      document_url: record?.document_url ?? "",
    });
  }, [open, record, vehicleId, vehicles, today]);

  const save = async () => {
    if (!f.vehicle_id) { toast({ title: "Choisissez un véhicule", variant: "destructive" }); return; }
    setBusy(true);
    try {
      await saveMaintenance({
        id: record?.id,
        vehicle_id: f.vehicle_id,
        calendar_event_id: record?.calendar_event_id ?? null,
        performed_on: f.performed_on || null,
        odometer_km: f.odometer_km ? Number(f.odometer_km) : null,
        engine_hours: f.engine_hours ? Number(f.engine_hours) : null,
        maintenance_type: f.maintenance_type || "entretien",
        work_done: f.work_done || null,
        parts_summary: f.parts_summary || null,
        supplier: f.supplier || null,
        cost: f.cost ? Number(f.cost) : 0,
        next_type: f.next_type || null,
        next_due_date: f.next_due_date || null,
        next_due_km: f.next_due_km ? Number(f.next_due_km) : null,
        next_due_hours: f.next_due_hours ? Number(f.next_due_hours) : null,
        alert_days_before: f.alert_days_before ? Number(f.alert_days_before) : 14,
        alert_km_margin: f.alert_km_margin ? Number(f.alert_km_margin) : 2000,
        alert_hours_margin: f.alert_hours_margin ? Number(f.alert_hours_margin) : 100,
        notes: f.notes || null,
        document_url: f.document_url || null,
      } as never);
      toast({ title: "Entretien enregistré", description: f.next_due_date ? "Ajouté au calendrier." : undefined });
      onOpenChange(false); onSaved();
    } catch (e) {
      toast({ title: "Enregistrement impossible", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{record ? "Modifier l'entretien" : "Ajouter un entretien"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field label="Véhicule *">
              <Select value={f.vehicle_id} onValueChange={(v) => setF({ ...f, vehicle_id: v })}>
                <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>{vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{vehicleLabel(v)}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Date"><Input type="date" value={f.performed_on ?? ""} onChange={(e) => setF({ ...f, performed_on: e.target.value })} /></Field>
          <Field label="Type d'entretien"><Input value={f.maintenance_type ?? ""} onChange={(e) => setF({ ...f, maintenance_type: e.target.value })} /></Field>
          <Field label="Kilométrage"><Input inputMode="numeric" value={f.odometer_km ?? ""} onChange={(e) => setF({ ...f, odometer_km: e.target.value })} /></Field>
          <Field label="Heures moteur"><Input inputMode="numeric" value={f.engine_hours ?? ""} onChange={(e) => setF({ ...f, engine_hours: e.target.value })} /></Field>
          <div className="col-span-2"><Field label="Travail effectué"><Textarea rows={2} value={f.work_done ?? ""} onChange={(e) => setF({ ...f, work_done: e.target.value })} /></Field></div>
          <Field label="Pièces remplacées"><Input value={f.parts_summary ?? ""} onChange={(e) => setF({ ...f, parts_summary: e.target.value })} /></Field>
          <Field label="Garage / fournisseur"><Input value={f.supplier ?? ""} onChange={(e) => setF({ ...f, supplier: e.target.value })} /></Field>
          <Field label="Coût ($)"><Input inputMode="decimal" value={f.cost ?? ""} onChange={(e) => setF({ ...f, cost: e.target.value })} /></Field>
          <Field label="Prochain entretien"><Input value={f.next_type ?? ""} onChange={(e) => setF({ ...f, next_type: e.target.value })} /></Field>
          <Field label="Prochaine date (calendrier)"><Input type="date" value={f.next_due_date ?? ""} onChange={(e) => setF({ ...f, next_due_date: e.target.value })} /></Field>
          <Field label="Prochain kilométrage"><Input inputMode="numeric" value={f.next_due_km ?? ""} onChange={(e) => setF({ ...f, next_due_km: e.target.value })} /></Field>
          <Field label="Prochaines heures moteur"><Input inputMode="numeric" value={f.next_due_hours ?? ""} onChange={(e) => setF({ ...f, next_due_hours: e.target.value })} /></Field>
          <div className="col-span-2 text-xs font-body text-muted-foreground">Rappel : alerte déclenchée avant l'échéance</div>
          <Field label="Jours d'avance"><Input inputMode="numeric" value={f.alert_days_before ?? ""} onChange={(e) => setF({ ...f, alert_days_before: e.target.value })} /></Field>
          <Field label="Marge (km)"><Input inputMode="numeric" value={f.alert_km_margin ?? ""} onChange={(e) => setF({ ...f, alert_km_margin: e.target.value })} /></Field>
          <Field label="Marge (heures)"><Input inputMode="numeric" value={f.alert_hours_margin ?? ""} onChange={(e) => setF({ ...f, alert_hours_margin: e.target.value })} /></Field>
          <div className="col-span-2"><Field label="Facture / document (lien)"><Input value={f.document_url ?? ""} onChange={(e) => setF({ ...f, document_url: e.target.value })} /></Field></div>
          <div className="col-span-2"><Field label="Notes"><Textarea rows={2} value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field></div>
          {record && <div className="col-span-2"><FleetDocuments ownerType="fleet_maintenance" ownerId={record.id} label="Factures et documents" /></div>}
        </div>
        <DialogFooter>
          {record && (
            <DeleteButton label="Supprimer cet entretien ?" onDelete={async () => {
              try {
                await deleteRow("fleet_maintenance", record.id);
                toast({ title: "Entretien supprimé" });
                onOpenChange(false); onSaved();
              } catch (e) {
                toast({ title: "Suppression impossible", description: (e as Error).message, variant: "destructive" });
              }
            }} />
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={save} disabled={busy}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Réparation
export function RepairDialog({ open, onOpenChange, vehicles, vehicleId, record, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; vehicles: Vehicle[];
  vehicleId?: string; record?: Repair | null; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [f, setF] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!open) return;
    setF({
      vehicle_id: record?.vehicle_id ?? vehicleId ?? vehicles[0]?.id ?? "",
      problem: record?.problem ?? "",
      reported_on: record?.reported_on ?? today,
      odometer_km: record?.odometer_km != null ? String(record.odometer_km) : "",
      description: record?.description ?? "",
      priority: record?.priority === "importante" ? "elevee" : (record?.priority ?? "normale"),
      status: record?.status ?? "a_diagnostiquer",
      cost_estimated: record?.cost_estimated != null ? String(record.cost_estimated) : "",
      cost_actual: record?.cost_actual != null ? String(record.cost_actual) : "",
      scheduled_date: record?.scheduled_date ?? "",
      completed_date: record?.completed_date ?? "",
      parts_summary: record?.parts_summary ?? "",
      supplier: record?.supplier ?? "",
      notes: record?.notes ?? "",
    });
  }, [open, record, vehicleId, vehicles, today]);

  const save = async () => {
    if (!f.vehicle_id || !f.problem.trim()) {
      toast({ title: "Véhicule et problème requis", variant: "destructive" }); return;
    }
    setBusy(true);
    try {
      await saveRepair({
        id: record?.id,
        vehicle_id: f.vehicle_id,
        calendar_event_id: record?.calendar_event_id ?? null,
        problem: f.problem.trim(),
        reported_on: f.reported_on || today,
        odometer_km: f.odometer_km ? Number(f.odometer_km) : null,
        description: f.description || null,
        priority: f.priority,
        status: f.status,
        cost_estimated: f.cost_estimated ? Number(f.cost_estimated) : null,
        cost_actual: f.cost_actual ? Number(f.cost_actual) : null,
        scheduled_date: f.scheduled_date || null,
        completed_date: f.completed_date || null,
        parts_summary: f.parts_summary || null,
        supplier: f.supplier || null,
        notes: f.notes || null,
      } as never);
      toast({ title: "Réparation enregistrée", description: f.scheduled_date ? "Ajoutée au calendrier." : undefined });
      onOpenChange(false); onSaved();
    } catch (e) {
      toast({ title: "Enregistrement impossible", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{record ? "Modifier la réparation" : "Ajouter une réparation"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field label="Véhicule *">
              <Select value={f.vehicle_id} onValueChange={(v) => setF({ ...f, vehicle_id: v })}>
                <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>{vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{vehicleLabel(v)}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <div className="col-span-2"><Field label="Problème *"><Input value={f.problem ?? ""} onChange={(e) => setF({ ...f, problem: e.target.value })} /></Field></div>
          <Field label="Date signalée"><Input type="date" value={f.reported_on ?? ""} onChange={(e) => setF({ ...f, reported_on: e.target.value })} /></Field>
          <Field label="Kilométrage"><Input inputMode="numeric" value={f.odometer_km ?? ""} onChange={(e) => setF({ ...f, odometer_km: e.target.value })} /></Field>
          <Field label="Priorité">
            <Select value={f.priority} onValueChange={(v) => setF({ ...f, priority: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PRIORITY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Statut">
            <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(REPAIR_STATUS_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Date prévue (calendrier)"><Input type="date" value={f.scheduled_date ?? ""} onChange={(e) => setF({ ...f, scheduled_date: e.target.value })} /></Field>
          <Field label="Date effectuée"><Input type="date" value={f.completed_date ?? ""} onChange={(e) => setF({ ...f, completed_date: e.target.value })} /></Field>
          <Field label="Coût estimé ($)"><Input inputMode="decimal" value={f.cost_estimated ?? ""} onChange={(e) => setF({ ...f, cost_estimated: e.target.value })} /></Field>
          <Field label="Coût réel ($)"><Input inputMode="decimal" value={f.cost_actual ?? ""} onChange={(e) => setF({ ...f, cost_actual: e.target.value })} /></Field>
          <Field label="Pièces utilisées"><Input value={f.parts_summary ?? ""} onChange={(e) => setF({ ...f, parts_summary: e.target.value })} /></Field>
          <Field label="Garage / fournisseur"><Input value={f.supplier ?? ""} onChange={(e) => setF({ ...f, supplier: e.target.value })} /></Field>
          <div className="col-span-2"><Field label="Description"><Textarea rows={2} value={f.description ?? ""} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field></div>
          <div className="col-span-2"><Field label="Notes"><Textarea rows={2} value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field></div>
          {record && <div className="col-span-2"><FleetDocuments ownerType="fleet_repair" ownerId={record.id} label="Factures et documents" /></div>}
        </div>
        <DialogFooter>
          {record && (
            <DeleteButton label="Supprimer cette réparation ?" onDelete={async () => {
              try {
                await deleteRow("fleet_repairs", record.id);
                toast({ title: "Réparation supprimée" });
                onOpenChange(false); onSaved();
              } catch (e) {
                toast({ title: "Suppression impossible", description: (e as Error).message, variant: "destructive" });
              }
            }} />
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={save} disabled={busy}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Inspection
export function InspectionDialog({ open, onOpenChange, vehicles, drivers, vehicleId, record, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; vehicles: Vehicle[]; drivers: Driver[];
  vehicleId?: string; record?: Inspection | null; onSaved: () => void;
}) {
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [vehicle, setVehicle] = useState("");
  const [driver, setDriver] = useState("none");
  const [date, setDate] = useState(today);
  const [km, setKm] = useState("");
  const [hours, setHours] = useState("");
  const [checks, setChecks] = useState<Record<string, CheckValue>>({});
  const [comment, setComment] = useState("");
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setVehicle(record?.vehicle_id ?? vehicleId ?? vehicles[0]?.id ?? "");
    setDriver(record?.driver_id ?? "none");
    setDate(record?.inspected_on ?? today);
    setKm(record?.odometer_km != null ? String(record.odometer_km) : "");
    setHours(record?.engine_hours != null ? String(record.engine_hours) : "");
    setChecks((record?.checks as Record<string, CheckValue>) ?? {});
    setComment(record?.comment ?? "");
    setSignature(record?.signature ?? "");
  }, [open, record, vehicleId, vehicles, today]);

  const save = async () => {
    if (!vehicle) { toast({ title: "Choisissez un véhicule", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const inspectionId = await saveInspection({
        id: record?.id,
        vehicle_id: vehicle,
        driver_id: driver === "none" ? null : driver,
        inspected_on: date,
        odometer_km: km ? Number(km) : null,
        engine_hours: hours ? Number(hours) : null,
        checks,
        comment: comment || null,
        signature: signature || null,
      } as never);
      // « À surveiller » et « Problème » alimentent les travaux à faire,
      // sans jamais créer dix fois le même constat.
      await syncWorkItemsFromInspection(
        { id: inspectionId, vehicle_id: vehicle, checks, comment, inspected_on: date } as never,
        points,
      ).catch(() => undefined);
      const problems = Object.values(checks).filter((v) => v === "probleme").length;
      toast({
        title: "Inspection enregistrée",
        description: problems
          ? `${problems} problème(s) transformé(s) en réparation à planifier.`
          : undefined,
      });
      onOpenChange(false); onSaved();
    } catch (e) {
      toast({ title: "Enregistrement impossible", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const current = vehicles.find((v) => v.id === vehicle) ?? null;
  const points = inspectionPointsFor(current);

  const tone = (v: CheckValue, active: boolean) => {
    if (!active) return "bg-secondary text-muted-foreground";
    if (v === "ok") return "bg-primary text-primary-foreground";
    if (v === "surveiller") return "bg-amber-500 text-white";
    return "bg-destructive text-destructive-foreground";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{record ? "Modifier l'inspection" : "Inspection quotidienne"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Véhicule *">
            <Select value={vehicle} onValueChange={setVehicle}>
              <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
              <SelectContent>{vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{vehicleLabel(v)}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Chauffeur">
              <Select value={driver} onValueChange={setDriver}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kilométrage"><Input inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} /></Field>
            {usesEngineHours(current) && (
              <Field label="Heures moteur"><Input inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
            )}
          </div>

          <div className="space-y-2">
            {points.map((p) => (
              <div key={p.key} className="flex items-center justify-between gap-2">
                <span className="text-sm font-body">{p.label}</span>
                <div className="flex gap-1">
                  {(["ok", "surveiller", "probleme"] as CheckValue[]).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setChecks({ ...checks, [p.key]: v })}
                      className={`px-3 py-2 rounded-lg text-xs font-display font-semibold min-w-[64px] ${tone(v, checks[p.key] === v)}`}
                    >
                      {CHECK_LABELS[v]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <Field label="Commentaire"><Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
          <Field label="Signature (nom)"><Input value={signature} onChange={(e) => setSignature(e.target.value)} /></Field>
          {record && <FleetDocuments ownerType="fleet_inspection" ownerId={record.id} label="Photos et rapports" />}
        </div>
        <DialogFooter>
          {record && (
            <DeleteButton label="Supprimer cette inspection ?" onDelete={async () => {
              try {
                await deleteRow("fleet_inspections", record.id);
                toast({ title: "Inspection supprimée" });
                onOpenChange(false); onSaved();
              } catch (e) {
                toast({ title: "Suppression impossible", description: (e as Error).message, variant: "destructive" });
              }
            }} />
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={save} disabled={busy}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
