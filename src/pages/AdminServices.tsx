// Lots 3 et 4 — demandes de services complémentaires et analyses de sols.
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import PageHeader from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SERVICE_KINDS, type ServiceKind } from "@/components/ops/ServiceOffers";
import type { Database } from "@/integrations/supabase/types";

type Req = Database["public"]["Tables"]["svc_requests"]["Row"];
const STATUS: Record<string, string> = {
  nouvelle: "Nouvelle", soumission: "Soumission envoyée", rendez_vous: "Rendez-vous fixé", prelevement: "Prélèvements faits",
  resultats: "Résultats reçus", confirmee: "Confirmée", refusee: "Refusée", annulee: "Annulée",
};
const FLOW_SOIL = ["nouvelle", "soumission", "rendez_vous", "prelevement", "resultats", "confirmee", "refusee", "annulee"];
const FLOW_SVC = ["nouvelle", "soumission", "confirmee", "refusee", "annulee"];
const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

export default function AdminServices() {
  const { isReady, user } = useAuthReady();
  const { isAdmin, loading: rl } = useUserRoles(user, isReady);
  const [rows, setRows] = useState<Req[]>([]);
  const [tab, setTab] = useState<"services" | "sols">("services");
  const [open, setOpen] = useState<Req | null>(null);
  const [f, setF] = useState<Record<string, string | boolean>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("svc_requests").select("*").order("created_at", { ascending: false }).limit(500);
    if (error) toast.error(error.message); setRows(data ?? []);
  }, []);
  useEffect(() => { if (isAdmin) void load(); }, [isAdmin, load]);

  const edit = (r: Req) => {
    setOpen(r);
    setF({ status: r.status, a: r.availability_ok, z: r.zone_ok, c: r.access_ok, quote: r.quote_amount?.toString() ?? "",
      appt: toLocal(r.appointment_at), sampled: toLocal(r.sampled_at), partner: r.partner ?? "", result: r.result_summary ?? "", note: "" });
  };
  const save = async () => {
    if (!open || busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("svc_request_update", {
      _id: open.id, _status: String(f.status), _availability: !!f.a, _zone: !!f.z, _access: !!f.c,
      _quote: f.quote ? Number(f.quote) : undefined, _appointment: f.appt ? new Date(String(f.appt)).toISOString() : undefined,
      _sampled: f.sampled ? new Date(String(f.sampled)).toISOString() : undefined, _partner: String(f.partner ?? ""),
      _result: String(f.result ?? ""), _staff_note: String(f.note ?? ""),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Demande mise à jour."); setOpen(null); void load();
  };

  if (!isReady || rl) return <p className="p-8 text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" /></p>;
  if (!isAdmin) return <p className="p-8 text-muted-foreground">Accès réservé à l'équipe Vrac Québec.</p>;
  const shown = rows.filter((r) => (tab === "sols") === (r.kind === "analyse_sol"));
  const soil = open?.kind === "analyse_sol";

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Services et analyses de sols" subtitle="Chaque demande vient d'un bouton client ou entrepreneur, reliée à son chantier."
        tabs={[{ key: "services", label: "Pépine, camions, matériaux" }, { key: "sols", label: "Analyses de sols" }]} activeTab={tab} onTabChange={(k) => setTab(k as typeof tab)} />
      <main className="mx-auto max-w-5xl space-y-2 px-4 py-5">
        {shown.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Aucune demande.</p>}
        {shown.map((r) => (
          <Card key={r.id} className="cursor-pointer hover:border-primary" onClick={() => edit(r)}>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div className="min-w-0">
                <p className="font-semibold">{SERVICE_KINDS[r.kind as ServiceKind]?.label ?? r.kind} · {r.requester_name ?? r.requester_email ?? "—"}</p>
                <p className="truncate text-xs text-muted-foreground">{r.site_address ?? "Chantier non précisé"} · {new Date(r.created_at).toLocaleDateString("fr-CA")}{r.note ? ` · ${r.note}` : ""}</p>
              </div>
              <Badge variant={r.status === "nouvelle" ? "destructive" : "secondary"}>{STATUS[r.status]}</Badge>
            </CardContent>
          </Card>
        ))}
      </main>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto break-words">
          {open && (<>
            <DialogHeader><DialogTitle>{SERVICE_KINDS[open.kind as ServiceKind]?.label}</DialogTitle></DialogHeader>
            <p className="text-sm">{open.requester_name} · {open.requester_email} · {open.requester_phone}<br />{open.site_address}</p>
            {open.note && <p className="text-sm text-muted-foreground">« {open.note} »</p>}
            <Label>Étape</Label>
            <select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={String(f.status)} onChange={(e) => setF({ ...f, status: e.target.value })}>
              {(soil ? FLOW_SOIL : FLOW_SVC).map((s) => <option key={s} value={s}>{STATUS[s]}</option>)}
            </select>
            {!soil && (
              <div className="space-y-1 rounded-md border p-2 text-sm">
                <p className="text-xs text-muted-foreground">À vérifier avant de confirmer :</p>
                {([["a", "Disponibilité"], ["z", "Zone desservie"], ["c", "Accès au terrain"]] as const).map(([k, l]) => (
                  <label key={k} className="flex items-center gap-2"><Checkbox checked={!!f[k]} onCheckedChange={(v) => setF({ ...f, [k]: !!v })} />{l}</label>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Soumission ($)</Label><Input inputMode="decimal" value={String(f.quote)} onChange={(e) => setF({ ...f, quote: e.target.value })} /></div>
              {soil && <div><Label>Partenaire / laboratoire</Label><Input value={String(f.partner)} onChange={(e) => setF({ ...f, partner: e.target.value })} /></div>}
              {soil && <div><Label>Rendez-vous</Label><Input type="datetime-local" value={String(f.appt)} onChange={(e) => setF({ ...f, appt: e.target.value })} /></div>}
              {soil && <div><Label>Prélèvements</Label><Input type="datetime-local" value={String(f.sampled)} onChange={(e) => setF({ ...f, sampled: e.target.value })} /></div>}
            </div>
            {soil && <><Label>Résumé des résultats</Label><Textarea value={String(f.result)} onChange={(e) => setF({ ...f, result: e.target.value })} /></>}
            <Label>Note interne {["refusee", "annulee"].includes(String(f.status)) && "(motif obligatoire)"}</Label>
            <Input value={String(f.note)} onChange={(e) => setF({ ...f, note: e.target.value })} />
            <Button disabled={busy} onClick={() => void save()}>{busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Enregistrer</Button>
          </>)}
        </DialogContent>
      </Dialog>
    </div>
  );
}
