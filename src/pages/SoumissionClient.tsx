// Consultation d'une soumission par le client (lien unique, sans compte).
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { unitLabel, lineTotal, type QLine } from "@/lib/entcrm/catalog";

const db = supabase as any;
const money = (n?: number | null) => n == null ? "—" : Number(n).toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
const STATUS: Record<string, string> = { remise: "En attente de votre réponse", acceptee: "Acceptée", refusee: "Refusée" };

export default function SoumissionClient() {
  const { token } = useParams();
  const [q, setQ] = useState<any>(undefined);
  const [err, setErr] = useState("");
  const [name, setName] = useState(""); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await db.rpc("entcrm_public_quote", { _token: token });
    if (error) { setErr("Impossible de charger la soumission. Vérifiez votre connexion puis réessayez."); setQ(null); return; }
    setQ(data ?? null);
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  const respond = async (decision: "acceptee" | "refusee") => {
    if (!name.trim()) return setErr("Indiquez votre nom pour répondre.");
    if (decision === "acceptee" && !confirm("Confirmer l'acceptation de cette soumission ?")) return;
    setBusy(true); setErr("");
    const { error } = await db.rpc("entcrm_public_respond", { _token: token, _decision: decision, _name: name, _note: note || null });
    setBusy(false);
    if (error) return setErr(error.message);
    load();
  };
  const download = async (id: string) => {
    const { data, error } = await supabase.functions.invoke("entcrm-quote-file", { body: { token, file_id: id } });
    if (error || !data?.url) return setErr(data?.error ?? "Téléchargement impossible, réessayez.");
    window.open(data.url, "_blank");
  };
  if (q === undefined) return <main className="p-6 text-muted-foreground">Chargement…</main>;
  if (!q) return <main className="mx-auto max-w-xl p-6"><h1 className="font-display text-xl font-bold">Lien invalide ou retiré</h1><p className="mt-2 text-sm text-muted-foreground">{err || "Demandez un nouveau lien à l'entreprise qui vous a transmis cette soumission."}</p></main>;
  const lines = q.lines as QLine[];
  return <main className="mx-auto max-w-3xl p-4 sm:p-6">
    <p className="font-display text-lg font-bold">{q.company}</p>
    <h1 className="font-display text-2xl font-bold">Soumission {q.number ?? ""} (version {q.version})</h1>
    <p className="text-sm">Client : {q.client ?? "—"} · <strong>{STATUS[q.status] ?? q.status}</strong></p>
    <div className="mt-4 overflow-x-auto rounded border border-border bg-card p-3"><table className="w-full text-sm"><thead><tr className="text-left"><th>Description</th><th>Qté</th><th>Unité</th><th>Prix</th><th>Total</th></tr></thead>
      <tbody>{lines.map((l, i) => <tr key={i} className="border-t border-border"><td className="py-1">{l.desc}</td><td>{l.qty ?? "—"}</td><td>{unitLabel(l.unit)}</td><td>{money(l.price)}</td><td>{money(lineTotal(l))}</td></tr>)}</tbody></table>
      <div className="mt-3 space-y-0.5 text-right text-sm">
        <p>Sous-total : {money(q.subtotal)}</p>
        {q.taxes_applied ? <><p>TPS ({q.gst_rate} %){q.gst_number ? ` — n° ${q.gst_number}` : ""} : {money(q.tax_gst)}</p><p>TVQ ({q.qst_rate} %){q.qst_number ? ` — n° ${q.qst_number}` : ""} : {money(q.tax_qst)}</p><p className="font-bold">Total : {money(q.total)}</p></>
          : <p className="text-xs text-muted-foreground">Taxes non incluses dans ce montant.</p>}
      </div></div>
    {q.inclusions && <p className="mt-3 text-sm"><strong>Inclusions :</strong> {q.inclusions}</p>}
    {q.exclusions && <p className="text-sm"><strong>Exclusions :</strong> {q.exclusions}</p>}
    {q.conditions && <p className="text-sm"><strong>Conditions :</strong> {q.conditions}</p>}
    {q.valid_until && <p className="text-sm">Valide jusqu'au {q.valid_until}</p>}
    {q.files.length > 0 && <section className="mt-4"><h2 className="font-display font-bold">Pièces jointes</h2>{q.files.map((f: any) => <div key={f.id} className="flex items-center justify-between border-t border-border py-2 text-sm"><span className="break-all">{f.name}</span><Button size="sm" variant="outline" onClick={() => download(f.id)}>Télécharger</Button></div>)}</section>}
    {q.status === "remise" ? <section className="mt-6 rounded border border-border p-3">
      <h2 className="font-display font-bold">Votre réponse</h2>
      <Input className="mt-2" placeholder="Votre nom *" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      <Textarea className="mt-2" placeholder="Commentaire (facultatif)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      <div className="mt-2 flex gap-2"><Button disabled={busy} onClick={() => respond("acceptee")}>Accepter</Button><Button disabled={busy} variant="outline" onClick={() => respond("refusee")}>Refuser</Button></div>
    </section> : <p className="mt-6 rounded bg-muted p-3 text-sm">Réponse enregistrée{q.client_responded_at ? ` le ${new Date(q.client_responded_at).toLocaleString("fr-CA")}` : ""}{q.accepted_by_name ? ` par ${q.accepted_by_name}` : ""}.</p>}
    {err && <p role="alert" className="mt-3 text-sm text-destructive">{err}</p>}
  </main>;
}
