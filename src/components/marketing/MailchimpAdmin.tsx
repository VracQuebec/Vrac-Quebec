import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

const db = supabase as any;

export default function MailchimpAdmin() {
  const [st, setSt] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [s, setS] = useState({ legal: "", addr: "", contact: "" });
  const [rows, setRows] = useState<any[]>([]);

  const call = useCallback(async (action: "status" | "sync") => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("mailchimp-sync", { body: { action } });
    setBusy(false);
    if (error) return setSt({ error: error.message });
    setSt(data);
    if (action === "sync") toast({ title: `Synchronisation : ${data.synced ?? 0} traité(s), ${data.failed ?? 0} erreur(s)` });
  }, []);

  useEffect(() => {
    call("status");
    db.from("mkt_sender_identity").select("*").maybeSingle().then(({ data }: any) => data && setS({ legal: data.legal_name ?? "", addr: data.postal_address ?? "", contact: data.contact ?? "" }));
    db.from("mkt_consents").select("email,source,accepted_at,withdrawn_at,mc_status,mc_error").order("created_at", { ascending: false }).limit(50).then(({ data }: any) => setRows(data ?? []));
  }, [call]);

  const save = async () => {
    const { error } = await db.rpc("mkt_sender_save", { _legal: s.legal, _addr: s.addr, _contact: s.contact });
    toast(error ? { title: "Refusé", description: error.message, variant: "destructive" } : { title: "Identité de l'expéditeur enregistrée" });
  };

  return (
    <Card><CardContent className="space-y-3 p-3 text-sm">
      <h2 className="font-semibold">Mailchimp et consentement aux promotions</h2>
      {st?.error && <p className="text-destructive">{st.error}</p>}
      {st && !st.error && (
        <ul className="space-y-1">
          <li>État : {st.configured && st.audience ? "Connecté" : "Non connecté"}</li>
          {st.missing?.length > 0 && <li className="text-destructive">Configuration manquante (secrets sécurisés du projet) : {st.missing.join(", ")}</li>}
          {st.audience_error && <li className="text-destructive">Audience inaccessible : {st.audience_error}</li>}
          <li>Audience : {st.audience ? `${st.audience.name} (${st.audience.stats?.member_count ?? 0} contacts)` : "—"}</li>
          <li>Dernière synchronisation : {st.last ? `${new Date(st.last.at).toLocaleString("fr-CA", { timeZone: "America/Toronto" })} — ${st.last.action}${st.last.ok ? "" : " (erreur)"}` : "jamais"}</li>
          <li>À synchroniser : {st.to_sync} · Erreurs à traiter : {st.errors}</li>
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => call("status")}>Actualiser</Button>
        <Button size="sm" disabled={busy || !st?.audience} onClick={() => call("sync")}>Synchroniser les consentements</Button>
      </div>
      <p className="text-xs text-muted-foreground">Aucune campagne n'est lancée d'ici. Seuls les consentements exprès documentés sont envoyés, en attente de confirmation par courriel; un désabonnement n'est jamais annulé.</p>

      <h3 className="pt-2 font-semibold">Identité légale de l'expéditeur</h3>
      <p className="text-xs text-muted-foreground">Tant qu'elle est incomplète, la case de consentement n'est pas affichée.</p>
      <Input placeholder="Nom légal" value={s.legal} onChange={(e) => setS({ ...s, legal: e.target.value })} />
      <Input placeholder="Adresse postale" value={s.addr} onChange={(e) => setS({ ...s, addr: e.target.value })} />
      <Input placeholder="Courriel ou téléphone de contact" value={s.contact} onChange={(e) => setS({ ...s, contact: e.target.value })} />
      <Button size="sm" variant="outline" onClick={save}>Enregistrer</Button>

      <h3 className="pt-2 font-semibold">Preuves de consentement récentes</h3>
      {!rows.length && <p className="text-muted-foreground">Aucun consentement.</p>}
      <ul className="space-y-1">{rows.map((r, i) => (
        <li key={i} className="break-words text-xs">{r.email} · {r.source} · {new Date(r.accepted_at).toLocaleString("fr-CA", { timeZone: "America/Toronto" })} · {r.withdrawn_at ? "retiré" : r.mc_status}{r.mc_error ? ` · ${r.mc_error}` : ""}</li>
      ))}</ul>
    </CardContent></Card>
  );
}
