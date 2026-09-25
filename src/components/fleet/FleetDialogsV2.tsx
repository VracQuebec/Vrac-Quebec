// Formulaires V2 : dépense, travail à faire, relevé de compteur.
// Mobile d'abord : peu de champs visibles, clavier numérique, date préremplie.
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import FleetDocuments, { PendingPhotos, uploadPendingDocuments } from "@/components/fleet/FleetDocuments";
import { PRIORITY_OPTIONS, vehicleLabel, type Vehicle } from "@/lib/fleet/api";
import {
  EXPENSE_CATEGORIES, EXPENSE_LABELS, WORK_STATUS_LABELS, addReading, deleteExpense,
  isMeterRegression, saveExpense, saveWorkItem, usesEngineHours,
  type Expense, type WorkItem,
} from "@/lib/fleet/v2";

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`space-y-1.5 ${wide ? "col-span-2" : ""}`}>
      <Label className="text-xs font-body text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function VehiclePicker({ vehicles, value, onChange, locked }: {
  vehicles: Vehicle[]; value: string; onChange: (v: string) => void; locked?: boolean;
}) {
  if (locked) {
    return (
      <Field label="Véhicule">
        <div className="h-10 flex items-center px-3 rounded-md border border-border bg-secondary/50 text-sm font-body">
          {vehicleLabel(vehicles.find((v) => v.id === value))}
        </div>
      </Field>
    );
  }
  return (
    <Field label="Véhicule *">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
        <SelectContent>
          {vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{vehicleLabel(v)}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  );
}

// ------------------------------------------------------------ Dépense
export function ExpenseDialog({ open, onOpenChange, vehicles, vehicleId, record, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; vehicles: Vehicle[];
  vehicleId?: string; record?: Expense | null; onSaved: () => void;
}) {
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState<Record<string, string>>({});
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMore(false);
    setF({
      vehicle_id: record?.vehicle_id ?? vehicleId ?? vehicles[0]?.id ?? "",
      spent_on: record?.spent_on ?? today,
      category: record?.category ?? "autres",
      description: record?.description ?? "",
      amount: record?.amount != null ? String(record.amount) : "",
      amount_before_tax: record?.amount_before_tax != null ? String(record.amount_before_tax) : "",
      taxes: record?.taxes != null ? String(record.taxes) : "",
      supplier: record?.supplier ?? "",
      odometer_km: record?.odometer_km != null ? String(record.odometer_km) : "",
      engine_hours: record?.engine_hours != null ? String(record.engine_hours) : "",
      notes: record?.notes ?? "",
    });
  }, [open, record, vehicleId, vehicles, today]);

  const save = async () => {
    if (!f.vehicle_id) { toast({ title: "Choisissez un véhicule", variant: "destructive" }); return; }
    if (Number(f.amount || 0) < 0) { toast({ title: "Le montant ne peut pas être négatif", variant: "destructive" }); return; }
    setBusy(true);
    try {
      await saveExpense({
        id: record?.id,
        vehicle_id: f.vehicle_id,
        spent_on: f.spent_on || today,
        category: f.category,
        description: f.description || null,
        amount: Number(f.amount || 0),
        amount_before_tax: f.amount_before_tax ? Number(f.amount_before_tax) : null,
        taxes: f.taxes ? Number(f.taxes) : null,
        supplier: f.supplier || null,
        odometer_km: f.odometer_km ? Number(f.odometer_km) : null,
        engine_hours: f.engine_hours ? Number(f.engine_hours) : null,
        notes: f.notes || null,
      } as never);
      if (f.odometer_km || f.engine_hours) {
        await addReading({
          vehicleId: f.vehicle_id,
          km: f.odometer_km ? Number(f.odometer_km) : null,
          hours: f.engine_hours ? Number(f.engine_hours) : null,
          source: "depense", readAt: `${f.spent_on || today}T12:00:00`,
        }).catch(() => undefined);
      }
      toast({ title: record ? "Dépense mise à jour" : "Dépense enregistrée" });
      onOpenChange(false); onSaved();
    } catch (e) {
      toast({ title: "Enregistrement impossible", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{record ? "Modifier la dépense" : "Ajouter une dépense"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <VehiclePicker vehicles={vehicles} value={f.vehicle_id ?? ""} locked={!!vehicleId && !record}
            onChange={(v) => setF({ ...f, vehicle_id: v })} />
          <Field label="Date"><Input type="date" value={f.spent_on ?? ""} onChange={(e) => setF({ ...f, spent_on: e.target.value })} /></Field>
          <Field label="Catégorie">
            <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{EXPENSE_LABELS[c]}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Montant total ($)">
            <Input inputMode="decimal" value={f.amount ?? ""} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          </Field>
          <Field label="Description" wide>
            <Input value={f.description ?? ""} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </Field>

          <div className="col-span-2">
            <button type="button" onClick={() => setMore(!more)} className="text-sm font-body text-primary">
              {more ? "− Masquer les options avancées" : "+ Options avancées"}
            </button>
          </div>
          {more && (
            <>
              <Field label="Montant avant taxes"><Input inputMode="decimal" value={f.amount_before_tax ?? ""} onChange={(e) => setF({ ...f, amount_before_tax: e.target.value })} /></Field>
              <Field label="Taxes"><Input inputMode="decimal" value={f.taxes ?? ""} onChange={(e) => setF({ ...f, taxes: e.target.value })} /></Field>
              <Field label="Fournisseur"><Input value={f.supplier ?? ""} onChange={(e) => setF({ ...f, supplier: e.target.value })} /></Field>
              <Field label="Kilométrage"><Input inputMode="numeric" value={f.odometer_km ?? ""} onChange={(e) => setF({ ...f, odometer_km: e.target.value })} /></Field>
              <Field label="Heures moteur"><Input inputMode="numeric" value={f.engine_hours ?? ""} onChange={(e) => setF({ ...f, engine_hours: e.target.value })} /></Field>
              <Field label="Notes" wide><Textarea rows={2} value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
            </>
          )}
          <div className="col-span-2">
            {record
              ? <FleetDocuments ownerType="fleet_expense" ownerId={record.id} label="Photos de la facture" />
              : <p className="text-xs text-muted-foreground font-body">Enregistrez la dépense, puis rouvrez-la pour ajouter la photo de la facture.</p>}
          </div>
        </div>
        <DialogFooter>
          {record && (
            <Button type="button" variant="ghost" className="mr-auto text-destructive hover:text-destructive"
              onClick={async () => {
                if (!window.confirm("Supprimer cette dépense ?\n\nCette action est définitive.")) return;
                await deleteExpense(record.id);
                toast({ title: "Dépense supprimée" });
                onOpenChange(false); onSaved();
              }}>Supprimer</Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={save} disabled={busy}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------ Travail à faire
export function WorkItemDialog({ open, onOpenChange, vehicles, vehicleId, record, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; vehicles: Vehicle[];
  vehicleId?: string; record?: WorkItem | null; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [f, setF] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setF({
      vehicle_id: record?.vehicle_id ?? vehicleId ?? vehicles[0]?.id ?? "",
      title: record?.title ?? "",
      description: record?.description ?? "",
      priority: record?.priority ?? "normale",
      status: record?.status ?? "ouvert",
      scheduled_date: record?.scheduled_date ?? "",
    });
  }, [open, record, vehicleId, vehicles]);

  const save = async () => {
    if (!f.title.trim()) { toast({ title: "Décrivez le travail à faire", variant: "destructive" }); return; }
    setBusy(true);
    try {
      await saveWorkItem({
        id: record?.id,
        vehicle_id: f.vehicle_id,
        title: f.title.trim(),
        description: f.description || null,
        priority: f.priority,
        status: f.status,
        scheduled_date: f.scheduled_date || null,
        source: record?.source ?? "manuel",
      } as never);
      toast({ title: record ? "Travail mis à jour" : "Travail ajouté" });
      onOpenChange(false); onSaved();
    } catch (e) {
      toast({ title: "Enregistrement impossible", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{record ? "Modifier le travail" : "Ajouter un travail à faire"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <VehiclePicker vehicles={vehicles} value={f.vehicle_id ?? ""} locked={!!vehicleId && !record}
            onChange={(v) => setF({ ...f, vehicle_id: v })} />
          <Field label="Priorité">
            <Select value={f.priority} onValueChange={(v) => setF({ ...f, priority: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PRIORITY_OPTIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Travail / problème *" wide>
            <Input value={f.title ?? ""} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </Field>
          <Field label="Description" wide>
            <Textarea rows={2} value={f.description ?? ""} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </Field>
          <Field label="Statut">
            <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(WORK_STATUS_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Date prévue">
            <Input type="date" value={f.scheduled_date ?? ""} onChange={(e) => setF({ ...f, scheduled_date: e.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={save} disabled={busy}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------ Relevé de compteur
export function ReadingDialog({ open, onOpenChange, vehicle, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; vehicle: Vehicle | null; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [km, setKm] = useState("");
  const [hours, setHours] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setKm(""); setHours(""); } }, [open]);

  const save = async () => {
    if (!vehicle) return;
    const kmVal = km ? Number(km) : null;
    const hVal = hours ? Number(hours) : null;
    if ((kmVal ?? 0) < 0 || (hVal ?? 0) < 0) {
      toast({ title: "Un compteur ne peut pas être négatif", variant: "destructive" }); return;
    }
    const back = isMeterRegression(vehicle.odometer_km as number | null, kmVal)
      || isMeterRegression(vehicle.engine_hours as number | null, hVal);
    let correction = false;
    if (back) {
      correction = window.confirm(
        "La valeur saisie est inférieure au dernier relevé connu.\n\n" +
        "OK = compteur remplacé / correction administrative (le compteur sera corrigé).\n" +
        "Annuler = ne pas modifier le compteur actuel.");
    }
    setBusy(true);
    try {
      await addReading({ vehicleId: vehicle.id, km: kmVal, hours: hVal, source: "manuel", isCorrection: correction });
      toast({ title: "Relevé enregistré" });
      onOpenChange(false); onSaved();
    } catch (e) {
      toast({ title: "Enregistrement impossible", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Relevé de compteur</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kilométrage"><Input inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} /></Field>
          {usesEngineHours(vehicle) && (
            <Field label="Heures moteur"><Input inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={save} disabled={busy}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
