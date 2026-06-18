import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Loader2 } from "lucide-react";
import {
  Truck, Driver, TRUCK_TYPES, TRUCK_TYPE_LABELS,
  DRIVER_STATUSES, DRIVER_STATUS_LABELS,
} from "@/lib/calendar-utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tab: "trucks" | "drivers";
  trucks: Truck[];
  drivers: Driver[];
  onChanged: () => void;
}

export default function FleetManager({ open, onOpenChange, tab, trucks, drivers, onChanged }: Props) {
  const [active, setActive] = useState(tab);
  useEffect(() => { if (open) setActive(tab); }, [open, tab]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Flotte et chauffeurs</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2 mb-3">
          <Button size="sm" variant={active === "trucks" ? "default" : "outline"} onClick={() => setActive("trucks")}>Camions</Button>
          <Button size="sm" variant={active === "drivers" ? "default" : "outline"} onClick={() => setActive("drivers")}>Chauffeurs</Button>
        </div>
        {active === "trucks"
          ? <TrucksList trucks={trucks} onChanged={onChanged} />
          : <DriversList drivers={drivers} onChanged={onChanged} />}
      </DialogContent>
    </Dialog>
  );
}

function TrucksList({ trucks, onChanged }: { trucks: Truck[]; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<Truck["type"]>("10_roues");
  const [plate, setPlate] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("trucks").insert({ name: name.trim(), type, plate: plate.trim() || null });
    setBusy(false);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    setName(""); setPlate("");
    onChanged();
  };

  const remove = async (id: string) => {
    if (!confirm("Supprimer ce camion ?")) return;
    const { error } = await supabase.from("trucks").delete().eq("id", id);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    onChanged();
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px_140px_auto] gap-2 p-3 bg-secondary rounded-lg">
        <Input placeholder="Nom (ex. 10 roues #1)" value={name} onChange={(e) => setName(e.target.value)} />
        <Select value={type} onValueChange={(v) => setType(v as Truck["type"])}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {TRUCK_TYPES.map((t) => <SelectItem key={t} value={t}>{TRUCK_TYPE_LABELS[t]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Plaque" value={plate} onChange={(e) => setPlate(e.target.value)} />
        <Button onClick={add} disabled={busy}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        </Button>
      </div>
      <div className="divide-y divide-border border border-border rounded-lg">
        {trucks.length === 0 && <div className="p-4 text-sm text-muted-foreground text-center">Aucun camion enregistré.</div>}
        {trucks.map((t) => (
          <div key={t.id} className="flex items-center justify-between p-3 text-sm">
            <div>
              <div className="font-display font-semibold">{t.name}</div>
              <div className="text-xs text-muted-foreground">{TRUCK_TYPE_LABELS[t.type]}{t.plate ? ` • ${t.plate}` : ""}</div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => remove(t.id)} className="text-destructive">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function DriversList({ drivers, onChanged }: { drivers: Driver[]; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<Driver["status"]>("disponible");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("drivers").insert({ name: name.trim(), phone: phone.trim() || null, status });
    setBusy(false);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    setName(""); setPhone("");
    onChanged();
  };

  const updateStatus = async (id: string, s: Driver["status"]) => {
    const { error } = await supabase.from("drivers").update({ status: s }).eq("id", id);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    onChanged();
  };

  const remove = async (id: string) => {
    if (!confirm("Supprimer ce chauffeur ?")) return;
    const { error } = await supabase.from("drivers").delete().eq("id", id);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    onChanged();
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px_140px_auto] gap-2 p-3 bg-secondary rounded-lg">
        <Input placeholder="Nom du chauffeur" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Téléphone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Select value={status} onValueChange={(v) => setStatus(v as Driver["status"])}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {DRIVER_STATUSES.map((s) => <SelectItem key={s} value={s}>{DRIVER_STATUS_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={add} disabled={busy}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        </Button>
      </div>
      <div className="divide-y divide-border border border-border rounded-lg">
        {drivers.length === 0 && <div className="p-4 text-sm text-muted-foreground text-center">Aucun chauffeur enregistré.</div>}
        {drivers.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-3 p-3 text-sm">
            <div className="flex-1 min-w-0">
              <div className="font-display font-semibold">{d.name}</div>
              <div className="text-xs text-muted-foreground">{d.phone || "—"}</div>
            </div>
            <Select value={d.status} onValueChange={(v) => updateStatus(d.id, v as Driver["status"])}>
              <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DRIVER_STATUSES.map((s) => <SelectItem key={s} value={s}>{DRIVER_STATUS_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" onClick={() => remove(d.id)} className="text-destructive">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}