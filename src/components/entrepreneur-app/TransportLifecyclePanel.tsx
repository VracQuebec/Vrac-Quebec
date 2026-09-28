// Dossier d'une demande de transport : informations, historique en lecture
// seule, versions, et boutons Modifier / Annuler. Toutes les règles sont
// appliquées par le serveur (request_update / request_cancel / request_cancel_request).
import { useCallback, useEffect, useState } from "react";
import { History, Pencil, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppCard } from "@/components/entrepreneur-app/ui";
import { SectionHeader, StatusBadge } from "@/components/entrepreneur-app/AppStates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  ACTION_LABELS, FIELD_LABELS, askCancellation, cancelMode, cancelRequest, canEdit, friendlyError, lifecycleMeta, updateRequest,
} from "@/lib/entrepreneur-app/lifecycle";

type Row = Record<string, unknown>;
const EDITABLE = ["site_address", "loading_point", "material_type", "quantity", "quantity_unit", "estimated_trips", "truck_type", "trailer_type", "truck_config", "desired_date", "access_conditions", "client_notes"] as const;
const NUMERIC = new Set(["quantity", "estimated_trips"]);
const REASONS = ["Chantier reporté", "Besoin annulé", "Erreur dans la demande", "Autre solution trouvée"];

const show = (v: unknown) => (v == null || v === "" ? "À confirmer" : String(v));
const dt = (v: unknown) => (v ? new Date(String(v)).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" }) : "—");

export default function TransportLifecyclePanel({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [row, setRow] = useState<Row | null>(null);
  const [events, setEvents] = useState<Row[]>([]);
  const [versions, setVersions] = useState<Row[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmEdit, setConfirmEdit] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [r, e, v] = await Promise.all([
      supabase.from("transport_requests").select("*").eq("id", id).maybeSingle(),
      supabase.from("transport_request_events").select("*").eq("request_id", id).order("created_at", { ascending: false }),
      supabase.from("transport_request_versions").select("version, changed_fields, created_at").eq("request_id", id).order("version", { ascending: false }),
    ]);
    setRow((r.data as Row | null) ?? null);
    setEvents((e.data as Row[] | null) ?? []);
    setVersions((v.data as Row[] | null) ?? []);
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (!row) return null;
  const meta = lifecycleMeta(String(row.lifecycle_status));
  const editable = canEdit(row);
  const mode = cancelMode(row);

  const openEdit = () => {
    setForm(Object.fromEntries(EDITABLE.map((k) => [k, row[k] == null ? "" : String(row[k])])));
    setConfirmEdit(false);
    setEditOpen(true);
  };
  const changes = () => {
    const out: Record<string, unknown> = {};
    for (const k of EDITABLE) {
      const before = row[k] == null ? "" : String(row[k]);
      const after = (form[k] ?? "").trim();
      if (after === before.trim()) continue;
      out[k] = after === "" ? null : NUMERIC.has(k) ? Number(after) : after;
    }
    return out;
  };
  const saveEdit = async () => {
    const c = changes();
    if (!Object.keys(c).length) { setEditOpen(false); return; }
    if (Object.entries(c).some(([k, v]) => NUMERIC.has(k) && v != null && !Number.isFinite(v as number))) {
      toast({ title: "Valeur numérique invalide", variant: "destructive" }); return;
    }
    setBusy(true);
    const { data, error } = await updateRequest(id, c);
    setBusy(false);
    if (error) { toast({ title: friendlyError(error.message), variant: "destructive" }); return; }
    const res = data as { critical?: string[]; status?: string } | null;
    toast({ title: "Modification enregistrée", description: res?.critical?.length ? "Changement important : une nouvelle version a été créée et la demande sera revalidée." : "L'historique a été mis à jour." });
    setEditOpen(false); await load(); onChanged();
  };
  const doCancel = async () => {
    if (!reason.trim()) { toast({ title: "Le motif est obligatoire.", variant: "destructive" }); return; }
    setBusy(true);
    const { error } = mode === "direct" ? await cancelRequest(id, reason.trim()) : await askCancellation(id, reason.trim());
    setBusy(false);
    if (error) { toast({ title: friendlyError(error.message), variant: "destructive" }); return; }
    toast({ title: mode === "direct" ? "Demande annulée" : "Demande d'annulation envoyée à Vrac Québec" });
    setCancelOpen(false); setReason(""); await load(); onChanged();
  };
  const pendingCancel = events.some((e) => e.action === "annulation_demandee") && mode !== "none";

  const info: [string, unknown][] = [
    ["Numéro", row.request_number], ["Créée le", dt(row.created_at)], ["Dernière mise à jour", dt(row.updated_at)],
    ["Version actuelle", row.current_version], ["Adresse du chantier", [row.site_address, row.site_city].filter(Boolean).join(", ")],
    ["Point de chargement", row.loading_point], ["Matériau", row.material_type ?? row.material_other],
    ["Quantité", row.quantity != null ? `${row.quantity} ${row.quantity_unit ?? ""}` : null], ["Voyages", row.estimated_trips],
    ["Type de camion", row.truck_type], ["Remorque", row.trailer_type], ["Configuration", row.truck_config],
    ["Date souhaitée", row.desired_date], ["Conditions d'accès", row.access_conditions],
  ];

  return (
    <section className="space-y-4">
      <SectionHeader title="Suivi de la demande" />
      <AppCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-display text-sm font-bold">Étape actuelle</p>
          {meta ? <StatusBadge label={meta.label} tone={meta.tone} /> : null}
        </div>
        {row.cancel_reason ? <p className="mt-2 font-body text-sm text-muted-foreground">Motif d'annulation : {String(row.cancel_reason)}</p> : null}
        {pendingCancel ? <p className="mt-2 font-body text-sm text-primary">Demande d'annulation en traitement par Vrac Québec.</p> : null}
        <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {info.map(([l, v]) => (
            <div key={l} className="min-w-0"><dt className="font-display text-xs font-bold text-muted-foreground">{l}</dt><dd className="break-words font-body text-sm">{show(v)}</dd></div>
          ))}
        </dl>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
          {editable && <Button onClick={openEdit} className="h-11 font-display font-bold"><Pencil className="mr-2 h-4 w-4" />Modifier ma demande</Button>}
          {mode !== "none" && !pendingCancel && (
            <Button variant="outline" onClick={() => setCancelOpen(true)} className="h-11 font-display font-bold">
              <XCircle className="mr-2 h-4 w-4" />{mode === "direct" ? "Annuler ma demande" : "Demander l'annulation"}
            </Button>
          )}
          {!editable && mode !== "none" && <p className="w-full font-body text-xs text-muted-foreground">Un transport est prêt ou assigné : les changements passent par Vrac Québec.</p>}
        </div>
      </AppCard>

      <AppCard>
        <p className="mb-3 flex items-center gap-2 font-display text-sm font-bold"><History className="h-4 w-4 text-primary" />Historique</p>
        {events.length === 0 ? <p className="font-body text-sm text-muted-foreground">Aucun événement enregistré.</p> : (
          <ol className="space-y-3">
            {events.map((e) => {
              const d = (e.details ?? {}) as { changed?: string[]; critical?: string[] };
              return (
                <li key={String(e.id)} className="border-l-2 border-primary pl-3">
                  <p className="font-display text-sm font-semibold">{ACTION_LABELS[String(e.action)] ?? String(e.action)}</p>
                  <p className="font-body text-xs text-muted-foreground">{dt(e.created_at)} · version {show(e.version)}</p>
                  {d.changed?.length ? <p className="font-body text-xs">Champs modifiés : {d.changed.map((k) => FIELD_LABELS[k] ?? k).join(", ")}</p> : null}
                  {d.critical?.length ? <p className="font-body text-xs text-destructive">Revalidation requise : {d.critical.map((k) => FIELD_LABELS[k] ?? k).join(", ")}</p> : null}
                  {e.reason ? <p className="font-body text-xs">Motif : {String(e.reason)}</p> : null}
                </li>
              );
            })}
          </ol>
        )}
        {versions.length > 0 && (
          <p className="mt-4 border-t border-border pt-3 font-body text-xs text-muted-foreground">
            Versions conservées : {versions.map((v) => `v${v.version} (${dt(v.created_at)})`).join(" · ")}
          </p>
        )}
      </AppCard>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifier ma demande</DialogTitle>
            <DialogDescription>Un changement important (dompe, adresse, camion, matériau, date, quantité, accès…) crée une nouvelle version et demande une revalidation.</DialogDescription>
          </DialogHeader>
          {!confirmEdit ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {EDITABLE.map((k) => (
                <div key={k} className={k === "access_conditions" || k === "client_notes" ? "sm:col-span-2" : ""}>
                  <Label htmlFor={`f-${k}`}>{FIELD_LABELS[k]}</Label>
                  {k === "access_conditions" || k === "client_notes" ? (
                    <Textarea id={`f-${k}`} maxLength={1000} value={form[k] ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                  ) : (
                    <Input id={`f-${k}`} type={k === "desired_date" ? "date" : NUMERIC.has(k) ? "number" : "text"} maxLength={200} value={form[k] ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2 font-body text-sm">
              <p className="font-semibold">Confirmer ces changements ?</p>
              <ul className="list-disc pl-5">{Object.entries(changes()).map(([k, v]) => <li key={k}>{FIELD_LABELS[k]} : {show(row[k])} → {show(v)}</li>)}</ul>
              {Object.keys(changes()).length === 0 && <p>Aucun changement.</p>}
            </div>
          )}
          <DialogFooter>
            {!confirmEdit ? (
              <Button onClick={() => setConfirmEdit(true)}>Continuer</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setConfirmEdit(false)}>Retour</Button>
                <Button onClick={saveEdit} disabled={busy}>Enregistrer</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{mode === "direct" ? "Annuler ma demande" : "Demander l'annulation"}</DialogTitle>
            <DialogDescription>
              {mode === "direct" ? "La demande est conservée avec son historique, marquée « Annulée »." : "Un transport est prêt ou assigné : Vrac Québec traitera votre demande d'annulation."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            {REASONS.map((r) => <Button key={r} type="button" size="sm" variant={reason === r ? "default" : "outline"} onClick={() => setReason(r)}>{r}</Button>)}
          </div>
          <Label htmlFor="cancel-reason">Motif (obligatoire)</Label>
          <Textarea id="cancel-reason" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Retour</Button>
            <Button variant="destructive" onClick={doCancel} disabled={busy || !reason.trim()}>Confirmer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
