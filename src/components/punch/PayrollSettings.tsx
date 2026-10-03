// Paramètres propres à l'employeur (FSS, CNESST, CCQ, FDRCMO, normes) + primes et corrections traçables.
// Une valeur inconnue reste vide et apparaît « manquante » sur les talons — jamais devinée.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

const db = supabase as any;
type Member = { user_id: string; full_name: string | null; email: string | null };
const n = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

export default function PayrollSettings({ companyId, members, runs, onChanged }: { companyId: string; members: Member[]; runs: any[]; onChanged: () => void }) {
  const [s, setS] = useState({ sector: "inconnu", total_payroll: "", cnesst_rate_per_100: "", ccq: "inconnu", fdrcmo_training: "", normes_exempt: false });
  const [adj, setAdj] = useState({ user: "", kind: "prime", amount: "", reason: "", run: "" });
  const [list, setList] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: es }, { data: a }] = await Promise.all([
      db.from("pay_employer_settings").select("*").eq("company_id", companyId).maybeSingle(),
      db.from("pay_adjustments").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(30),
    ]);
    if (es) setS({ sector: es.sector, total_payroll: es.total_payroll?.toString() ?? "", cnesst_rate_per_100: es.cnesst_rate_per_100?.toString() ?? "",
      ccq: es.ccq_applicable == null ? "inconnu" : es.ccq_applicable ? "oui" : "non", fdrcmo_training: es.fdrcmo_training?.toString() ?? "", normes_exempt: es.normes_exempt });
    setList(a ?? []);
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);

  const run = async (fn: string, args: any, ok: string) => {
    if (busy) return; setBusy(true);
    const { error } = await db.rpc(fn, args); setBusy(false);
    if (error) return toast({ title: "Refusé", description: error.message, variant: "destructive" });
    toast({ title: ok }); void load(); onChanged();
  };
  const nm = (id: string) => members.find((m) => m.user_id === id)?.full_name || members.find((m) => m.user_id === id)?.email || "Employé";
  const P = n(s.total_payroll);

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-md border border-border p-3">
        <h3 className="font-semibold">Charges patronales de l'entreprise</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-xs">Secteur (FSS)
            <select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={s.sector} onChange={(e) => setS({ ...s, sector: e.target.value })}>
              <option value="inconnu">Inconnu — FSS manquant</option><option value="ordinaire">Employeur ordinaire</option>
              <option value="primaire_manufacturier">Primaire ou manufacturier (taux à documenter)</option><option value="public">Secteur public</option>
            </select></label>
          <label className="text-xs">Masse salariale totale pertinente ($)<Input inputMode="decimal" value={s.total_payroll} onChange={(e) => setS({ ...s, total_payroll: e.target.value })} /></label>
          <label className="text-xs">Taux CNESST ($ par 100 $)<Input inputMode="decimal" placeholder="Manquant" value={s.cnesst_rate_per_100} onChange={(e) => setS({ ...s, cnesst_rate_per_100: e.target.value })} /></label>
          <label className="text-xs">Assujetti à la CCQ
            <select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={s.ccq} onChange={(e) => setS({ ...s, ccq: e.target.value })}>
              <option value="inconnu">Non précisé</option><option value="non">Non</option><option value="oui">Oui — paramètres du régime à documenter</option>
            </select></label>
          <label className="text-xs">Dépenses de formation admissibles (FDRCMO)<Input inputMode="decimal" value={s.fdrcmo_training} onChange={(e) => setS({ ...s, fdrcmo_training: e.target.value })} /></label>
          <label className="flex items-center gap-2 pt-5 text-xs"><input type="checkbox" checked={s.normes_exempt} onChange={(e) => setS({ ...s, normes_exempt: e.target.checked })} />Exempté de la cotisation aux normes du travail</label>
        </div>
        {P != null && P > 2000000 && <p className="text-xs text-destructive">Masse salariale supérieure à 2 M$ : vérifier l'assujettissement au FDRCMO (1 % moins les dépenses de formation admissibles).</p>}
        <Button size="sm" disabled={busy} onClick={() => run("pay_employer_settings_save", { _company: companyId, s: {
          sector: s.sector, total_payroll: P, cnesst_rate_per_100: n(s.cnesst_rate_per_100), ccq_applicable: s.ccq === "inconnu" ? null : s.ccq === "oui",
          fdrcmo_training: n(s.fdrcmo_training), normes_exempt: s.normes_exempt } }, "Paramètres employeur enregistrés")}>Enregistrer</Button>
      </div>

      <div className="space-y-2 rounded-md border border-border p-3">
        <h3 className="font-semibold">Primes et corrections</h3>
        <p className="text-xs text-muted-foreground">Ajoutées à la prochaine paie calculée. Une paie finalisée ne change jamais : une erreur se corrige ici, avec motif.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <select className="h-10 rounded-md border border-input bg-background px-2 text-sm" value={adj.user} onChange={(e) => setAdj({ ...adj, user: e.target.value })}>
            <option value="">Employé…</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{nm(m.user_id)}</option>)}
          </select>
          <select className="h-10 rounded-md border border-input bg-background px-2 text-sm" value={adj.kind} onChange={(e) => setAdj({ ...adj, kind: e.target.value })}>
            <option value="prime">Prime (imposée au taux marginal)</option><option value="correction">Correction d'une paie (+ ou −)</option>
          </select>
          <Input inputMode="decimal" placeholder="Montant" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} />
          {adj.kind === "correction" && <select className="h-10 rounded-md border border-input bg-background px-2 text-sm" value={adj.run} onChange={(e) => setAdj({ ...adj, run: e.target.value })}>
            <option value="">Paie finalisée corrigée…</option>{runs.filter((r) => r.status === "finalise").map((r) => <option key={r.id} value={r.id}>{r.period_from} → {r.period_to}</option>)}
          </select>}
          <Input className="sm:col-span-2" placeholder="Motif (obligatoire)" value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} />
        </div>
        <Button size="sm" disabled={busy || !adj.user || !n(adj.amount) || adj.reason.trim().length < 3 || (adj.kind === "correction" && !adj.run)}
          onClick={() => run("pay_adjustment_add", { _company: companyId, _user: adj.user, _kind: adj.kind, _amount: n(adj.amount), _reason: adj.reason, _source_run: adj.run || null }, "Ajout enregistré")
            .then(() => setAdj({ user: "", kind: "prime", amount: "", reason: "", run: "" }))}>Ajouter</Button>
        <ul className="space-y-1 text-xs">{list.map((a) => (
          <li key={a.id} className="rounded bg-muted/50 p-2">{nm(a.user_id)} · {a.kind === "prime" ? "Prime" : "Correction"} {Number(a.amount).toLocaleString("fr-CA", { style: "currency", currency: "CAD" })} · {a.reason} · {a.applied_run_id ? "intégrée à une paie" : "en attente de la prochaine paie"}</li>
        ))}</ul>
      </div>
    </div>
  );
}
