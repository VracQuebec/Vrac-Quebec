// « Marquer comme terminé » — clôture d'un entretien ou d'une réparation.
// Met à jour le statut, l'historique, les coûts, les relevés du véhicule,
// ferme l'alerte du centre de notifications existant et recrée l'échéance suivante.
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  completeMaintenance, completeRepair,
  type Maintenance, type Repair,
} from "@/lib/fleet/api";

type Target =
  | { kind: "entretien"; record: Maintenance }
  | { kind: "reparation"; record: Repair };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-body text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export default function CompleteDialog({ target, onOpenChange, onSaved }: {
  target: Target | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!target) return;
    const r = target.record as Maintenance & Repair;
    setF({
      date: today,
      km: r.odometer_km != null ? String(r.odometer_km) : "",
      hours: "",
      cost: target.kind === "entretien"
        ? (r.cost != null ? String(r.cost) : "")
        : (r.cost_actual ?? r.cost_estimated) != null ? String(r.cost_actual ?? r.cost_estimated) : "",
      notes: "",
      nextType: target.kind === "entretien" ? (r.next_type ?? r.maintenance_type ?? "") : "",
      nextDate: "",
      nextKm: "",
      nextHours: "",
    });
  }, [target, today]);

  if (!target) return null;

  const num = (v: string) => (v.trim() ? Number(v) : null);

  const save = async () => {
    setBusy(true);
    try {
      const input = {
        date: f.date || today,
        odometerKm: num(f.km ?? ""),
        engineHours: num(f.hours ?? ""),
        cost: num(f.cost ?? ""),
        notes: f.notes || null,
      };
      if (target.kind === "reparation") {
        await completeRepair(target.record, input);
      } else {
        await completeMaintenance(target.record, {
          ...input,
          nextType: f.nextType || null,
          nextDate: f.nextDate || null,
          nextKm: num(f.nextKm ?? ""),
          nextHours: num(f.nextHours ?? ""),
        });
      }
      toast({
        title: "Travail terminé",
        description: "Historique, coûts et alertes mis à jour.",
      });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast({ title: "Enregistrement impossible", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {target.kind === "entretien" ? "Entretien terminé" : "Réparation terminée"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date effectuée">
            <Input type="date" value={f.date ?? ""} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <Field label="Coût réel ($)">
            <Input inputMode="decimal" value={f.cost ?? ""} onChange={(e) => setF({ ...f, cost: e.target.value })} />
          </Field>
          <Field label="Kilométrage">
            <Input inputMode="numeric" value={f.km ?? ""} onChange={(e) => setF({ ...f, km: e.target.value })} />
          </Field>
          <Field label="Heures moteur">
            <Input inputMode="numeric" value={f.hours ?? ""} onChange={(e) => setF({ ...f, hours: e.target.value })} />
          </Field>
          <div className="col-span-2">
            <Field label="Notes">
              <Textarea rows={2} value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} />
            </Field>
          </div>
          {target.kind === "entretien" && (
            <>
              <div className="col-span-2 border-t border-border pt-3 text-xs font-body text-muted-foreground">
                Prochaine échéance (facultative) — date, kilométrage ou heures moteur
              </div>
              <div className="col-span-2">
                <Field label="Type d'entretien">
                  <Input value={f.nextType ?? ""} onChange={(e) => setF({ ...f, nextType: e.target.value })} />
                </Field>
              </div>
              <Field label="Prochaine date">
                <Input type="date" value={f.nextDate ?? ""} onChange={(e) => setF({ ...f, nextDate: e.target.value })} />
              </Field>
              <Field label="Prochain kilométrage">
                <Input inputMode="numeric" value={f.nextKm ?? ""} onChange={(e) => setF({ ...f, nextKm: e.target.value })} />
              </Field>
              <Field label="Prochaines heures moteur">
                <Input inputMode="numeric" value={f.nextHours ?? ""} onChange={(e) => setF({ ...f, nextHours: e.target.value })} />
              </Field>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={save} disabled={busy}>Marquer comme terminé</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
