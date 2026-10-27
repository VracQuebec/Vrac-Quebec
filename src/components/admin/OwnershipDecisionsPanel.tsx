import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Req = { id: string; submission_id: string; company_id: string; requester_note: string; status: string; created_at: string };
const PROOFS = [
  ["session_auteur_journalisee", "Session de l’auteur journalisée"],
  ["confirmation_ecrite_client", "Confirmation écrite du client"],
  ["document_signe", "Document signé"],
  ["appel_journalise", "Appel journalisé"],
] as const;

// Décision administrative : la preuve est obligatoire pour approuver, le motif pour refuser. Le serveur revérifie tout.
export default function OwnershipDecisionsPanel() {
  const [rows, setRows] = useState<Req[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, { proof: string; ref: string; note: string }>>({});
  const load = useCallback(async () => {
    const { data, error } = await supabase.from("submission_ownership_requests").select("id,submission_id,company_id,requester_note,status,created_at").eq("status", "en_attente").order("created_at");
    if (error) { setError("Demandes de rattachement illisibles."); return; }
    setError(null); setRows((data ?? []) as Req[]);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const f = (id: string) => form[id] ?? { proof: "", ref: "", note: "" };
  const decide = async (id: string, approve: boolean) => {
    const v = f(id); setBusy(id); setError(null);
    const { data, error } = await supabase.rpc("submission_ownership_decide" as never, { _request: id, _approve: approve, _proof_type: approve ? v.proof || null : null, _proof_reference: approve ? v.ref : null, _note: v.note } as never);
    setBusy(null);
    const state = (data as { state?: string } | null)?.state;
    if (error || !state) { setError(error?.message ?? "Décision non confirmée par le serveur."); return; }
    await load();
  };
  return (
    <section aria-labelledby="own-title" className="rounded-xl border bg-card p-4 space-y-3">
      <h2 id="own-title" className="font-display text-base font-bold">Rattachements de demandes à vérifier</h2>
      <p className="text-xs text-muted-foreground">Approuver exige une preuve fiable et sa référence; refuser exige un motif. Jamais d’après un nom ou un courriel.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {rows.length === 0 && !error && <p className="text-sm text-muted-foreground">Aucune demande en attente.</p>}
      {rows.map(r => { const v = f(r.id); const set = (p: Partial<typeof v>) => setForm({ ...form, [r.id]: { ...v, ...p } }); return (
        <article key={r.id} className="rounded-lg border p-3 space-y-2">
          <p className="text-sm">Demande <span className="font-mono">{r.submission_id.slice(0, 8)}</span> · entreprise <span className="font-mono">{r.company_id.slice(0, 8)}</span> · {new Date(r.created_at).toLocaleString("fr-CA", { timeZone: "America/Toronto" })}</p>
          {r.requester_note && <p className="text-sm text-muted-foreground">« {r.requester_note} »</p>}
          <select aria-label="Type de preuve" className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={v.proof} onChange={e => set({ proof: e.target.value })}>
            <option value="">Type de preuve…</option>{PROOFS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <Input aria-label="Référence de la preuve" placeholder="Référence de la preuve" value={v.ref} onChange={e => set({ ref: e.target.value })} />
          <Textarea aria-label="Note ou motif" placeholder="Note (motif obligatoire pour un refus)" value={v.note} onChange={e => set({ note: e.target.value })} />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy === r.id || !v.proof || v.ref.trim().length < 3} onClick={() => void decide(r.id, true)}>Approuver</Button>
            <Button size="sm" variant="outline" disabled={busy === r.id || v.note.trim().length < 3} onClick={() => void decide(r.id, false)}>Refuser avec motif</Button>
          </div>
        </article>); })}
    </section>
  );
}
