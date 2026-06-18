import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Trash2 } from "lucide-react";
import {
  CalendarEvent, Truck, Driver, EVENT_STATUSES, STATUS_LABELS,
  TRUCK_TYPE_LABELS, toLocalInput,
} from "@/lib/calendar-utils";

export type EventDraft = Partial<CalendarEvent>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: EventDraft | null;
  trucks: Truck[];
  drivers: Driver[];
  entrepreneurs: { id: string; name: string; company: string | null }[];
  onSaved: () => void;
}

export default function EventModal({ open, onOpenChange, initial, trucks, drivers, entrepreneurs, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EventDraft>({});

  useEffect(() => {
    if (!open) return;
    const now = new Date();
    now.setMinutes(0, 0, 0);
    now.setHours(8);
    setForm({
      title: "",
      status: "planifie",
      start_at: now.toISOString(),
      end_at: null,
      ...initial,
    });
  }, [open, initial]);

  const upd = (k: keyof CalendarEvent, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.title || !form.start_at) {
      toast({ title: "Champs manquants", description: "Titre et date de début requis.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload: any = {
      title: form.title,
      start_at: form.start_at,
      end_at: form.end_at || null,
      status: form.status || "planifie",
      dompe_number: form.dompe_number || null,
      dompe_address: form.dompe_address || null,
      loading_address: form.loading_address || null,
      delivery_address: form.delivery_address || null,
      material_type: form.material_type || null,
      trips_planned: form.trips_planned ?? null,
      tonnage_estimated: form.tonnage_estimated ?? null,
      quantity_estimated: form.quantity_estimated || null,
      entrepreneur_id: form.entrepreneur_id || null,
      driver_id: form.driver_id || null,
      truck_id: form.truck_id || null,
      submission_id: form.submission_id || null,
      client_name: form.client_name || null,
      admin_notes: form.admin_notes || null,
      special_instructions: form.special_instructions || null,
    };
    let err;
    if (form.id) {
      ({ error: err } = await supabase.from("calendar_events").update(payload).eq("id", form.id));
    } else {
      ({ error: err } = await supabase.from("calendar_events").insert(payload));
    }
    setSaving(false);
    if (err) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
      return;
    }
    toast({ title: form.id ? "Événement mis à jour" : "Livraison planifiée" });
    onSaved();
    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (!form.id) return;
    if (!confirm("Supprimer cet événement ?")) return;
    const { error } = await supabase.from("calendar_events").delete().eq("id", form.id);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Supprimé" });
    onSaved();
    onOpenChange(false);
  };

  const localStart = form.start_at ? toLocalInput(new Date(form.start_at)) : "";
  const localEnd = form.end_at ? toLocalInput(new Date(form.end_at)) : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? "Modifier l'événement" : "Planifier une livraison"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <Section title="Informations générales">
            <Field label="Titre *">
              <Input value={form.title || ""} onChange={(e) => upd("title", e.target.value)} placeholder="Ex. Livraison sable Dompe 240" />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Début *">
                <Input type="datetime-local" value={localStart}
                  onChange={(e) => upd("start_at", e.target.value ? new Date(e.target.value).toISOString() : null)} />
              </Field>
              <Field label="Fin estimée">
                <Input type="datetime-local" value={localEnd}
                  onChange={(e) => upd("end_at", e.target.value ? new Date(e.target.value).toISOString() : null)} />
              </Field>
            </div>
            <Field label="Statut">
              <Select value={form.status || "planifie"} onValueChange={(v) => upd("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </Section>

          <Section title="Informations chantier">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Numéro de dompe">
                <Input value={form.dompe_number || ""} onChange={(e) => upd("dompe_number", e.target.value)} placeholder="Ex. 240" />
              </Field>
              <Field label="Type de matériel">
                <Input value={form.material_type || ""} onChange={(e) => upd("material_type", e.target.value)} placeholder="Ex. Sable, 0-3/4" />
              </Field>
            </div>
            <Field label="Adresse de la dompe">
              <Input value={form.dompe_address || ""} onChange={(e) => upd("dompe_address", e.target.value)} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Adresse de chargement">
                <Input value={form.loading_address || ""} onChange={(e) => upd("loading_address", e.target.value)} />
              </Field>
              <Field label="Adresse de livraison">
                <Input value={form.delivery_address || ""} onChange={(e) => upd("delivery_address", e.target.value)} />
              </Field>
            </div>
            <Field label="Nom du client">
              <Input value={form.client_name || ""} onChange={(e) => upd("client_name", e.target.value)} />
            </Field>
          </Section>

          <Section title="Informations transport">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Voyages prévus">
                <Input type="number" value={form.trips_planned ?? ""} onChange={(e) => upd("trips_planned", e.target.value ? Number(e.target.value) : null)} />
              </Field>
              <Field label="Tonnage estimé">
                <Input type="number" step="0.1" value={form.tonnage_estimated ?? ""} onChange={(e) => upd("tonnage_estimated", e.target.value ? Number(e.target.value) : null)} />
              </Field>
              <Field label="Quantité estimée">
                <Input value={form.quantity_estimated || ""} onChange={(e) => upd("quantity_estimated", e.target.value)} placeholder="Ex. 200 m³" />
              </Field>
            </div>
          </Section>

          <Section title="Assignation">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Entrepreneur">
                <Select value={form.entrepreneur_id || "_none"} onValueChange={(v) => upd("entrepreneur_id", v === "_none" ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Aucun —</SelectItem>
                    {entrepreneurs.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.company || e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Chauffeur">
                <Select value={form.driver_id || "_none"} onValueChange={(v) => upd("driver_id", v === "_none" ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Aucun —</SelectItem>
                    {drivers.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Camion">
                <Select value={form.truck_id || "_none"} onValueChange={(v) => upd("truck_id", v === "_none" ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Aucun —</SelectItem>
                    {trucks.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name} ({TRUCK_TYPE_LABELS[t.type]})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </Section>

          <Section title="Notes">
            <Field label="Notes administratives">
              <Textarea rows={2} value={form.admin_notes || ""} onChange={(e) => upd("admin_notes", e.target.value)} />
            </Field>
            <Field label="Instructions spéciales">
              <Textarea rows={2} value={form.special_instructions || ""} onChange={(e) => upd("special_instructions", e.target.value)} />
            </Field>
          </Section>
        </div>

        <DialogFooter className="flex sm:justify-between gap-2">
          {form.id ? (
            <Button variant="outline" onClick={handleDelete} className="text-destructive">
              <Trash2 className="w-4 h-4 mr-1" /> Supprimer
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {form.id ? "Enregistrer" : "Planifier"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="font-display font-semibold text-sm text-foreground border-b border-border pb-1">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-display text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}