// FIN-14 (suite) — exercices, soldes d'ouverture, clôture/réouverture; FIN-15 (partiel) — états financiers
// calculés uniquement depuis les écritures validées du grand livre.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney, todayIn } from "@/lib/finances/period";

const db = supabase as any;
const err = (e: any) => toast({ title: "Action refusée", description: e?.message ?? String(e), variant: "destructive" });
type Year = { id: string; label: string; start_date: string; end_date: string; status: "open" | "closed"; opening_entry_id: string | null; closed_at: string | null };

export function FiscalYears({ companyId, canWrite, onOpenEntry }: { companyId: string; canWrite: boolean; onOpenEntry: (id: string) => void }) {
  const [years, setYears] = useState<Year[] | null>(null);
  const [ev, setEv] = useState<{ year_id: string; action: string; reason: string | null; at: string }[]>([]);
  const [f, setF] = useState({ label: "", start: "", end: "" });
  const load = useCallback(async () => {
    const { data, error } = await db.from("fin_gl_years").select("*").eq("company_id", companyId).order("start_date", { ascending: false });
    if (error) return err(error); setYears(data);
    const { data: e } = await db.from("fin_gl_year_events").select("year_id,action,reason,at").eq("company_id", companyId).order("at", { ascending: false }).limit(50);
    setEv(e ?? []);
  }, [companyId]);
  useEffect(() => { setYears(null); void load(); }, [load]);
  const call = async (fn: string, args: object, ok: string) => { const { data, error } = await db.rpc(fn, args); if (error) return err(error); toast({ title: ok }); await load(); return data; };
  const LABEL: Record<string, string> = { create: "Création", opening_draft: "Brouillon d'ouverture", close: "Clôture", reopen: "Réouverture" };
  return <div className="space-y-4">
    <p className="rounded-md border border-border bg-secondary/40 p-3 text-xs">Un exercice fermé n'accepte plus aucune écriture validée, ni contrepassation. La clôture exige zéro brouillon daté dans l'exercice et une balance équilibrée. La réouverture est réservée au propriétaire, avec motif, et reste historisée. Les soldes d'ouverture se saisissent une seule fois, à la date de coupure (premier jour de l'exercice).</p>
    {canWrite && <section className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-4">
      <label className="text-sm">Libellé<Input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="2026" /></label>
      <label className="text-sm">Début<Input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>
      <label className="text-sm">Fin<Input type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></label>
      <Button className="self-end" disabled={!f.label || !f.start || !f.end} onClick={async () => { await call("fin_gl_year_save", { _company: companyId, _label: f.label, _start: f.start, _end: f.end }, "Exercice créé"); setF({ label: "", start: "", end: "" }); }}>Créer l'exercice</Button>
    </section>}
    {!years ? <p className="text-sm text-muted-foreground">Chargement…</p> : !years.length ? <p className="text-sm text-muted-foreground">Aucun exercice défini.</p> :
      years.map((y) => <div key={y.id} className="rounded-md border border-border p-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong>{y.label} · {y.start_date} → {y.end_date}</strong>
          <span className={y.status === "closed" ? "font-semibold" : "text-muted-foreground"}>{y.status === "closed" ? "Fermé" : "Ouvert"}</span></div>
        <div className="mt-1 text-xs text-muted-foreground">Soldes d'ouverture : {y.opening_entry_id ? <button className="underline" onClick={() => onOpenEntry(y.opening_entry_id!)}>ouvrir l'écriture d'ouverture</button> : "À compléter"}</div>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => void yearEndFile(companyId, y).catch(err)}>Dossier de fin d'exercice (Excel)</Button>
        {canWrite && <div className="mt-2 flex flex-wrap gap-2">
          {y.status === "open" && <Button size="sm" variant="outline" onClick={async () => { const id = await call("fin_gl_opening_draft", { _year: y.id }, "Écriture d'ouverture prête"); if (id) onOpenEntry(id as string); }}>{y.opening_entry_id ? "Écriture d'ouverture" : "Saisir les soldes d'ouverture"}</Button>}
          {y.status === "open" && <Button size="sm" onClick={() => { const r = window.prompt("Motif ou note de clôture (facultatif)") ?? ""; void call("fin_gl_year_close", { _year: y.id, _reason: r }, "Exercice fermé"); }}>Clôturer</Button>}
          {y.status === "closed" && <Button size="sm" variant="outline" onClick={() => { const r = window.prompt("Motif de réouverture (obligatoire)"); if (r) void call("fin_gl_year_reopen", { _year: y.id, _reason: r }, "Exercice rouvert"); }}>Rouvrir</Button>}
        </div>}
        <ul className="mt-2 text-xs text-muted-foreground">{ev.filter((e) => e.year_id === y.id).map((e, i) => <li key={i}>{new Date(e.at).toLocaleString("fr-CA", { timeZone: "America/Toronto" })} · {LABEL[e.action] ?? e.action}{e.reason ? ` — ${e.reason}` : ""}</li>)}</ul>
      </div>)}
  </div>;
}

type Row = { id: string; number: string; name: string; category: string; amount: number; lines?: number };
type St = { company: string; from: string; to: string; currency: string; income: Row[]; balance: Row[]; result_cumul: number; drafts_in_period: number };

export function Statements({ companyId, onOpenAccount }: { companyId: string; onOpenAccount: (accountId: string, from: string, to: string) => void }) {
  const t = todayIn();
  const [p, setP] = useState({ from: t.slice(0, 4) + "-01-01", to: t });
  const [st, setSt] = useState<St | null>(null);
  useEffect(() => { setSt(null); void db.rpc("fin_gl_statements", { _company: companyId, _from: p.from, _to: p.to }).then(({ data, error }: any) => error ? err(error) : setSt(data)); }, [companyId, p]);
  const sum = (rows: Row[], c: string) => rows.filter((r) => r.category === c).reduce((n, r) => n + Number(r.amount), 0);
  const csv = () => {
    if (!st) return;
    const lines = [["Entreprise", st.company], ["Période", `${st.from} au ${st.to}`], ["Devise", st.currency], [], ["État", "Compte", "Nom", "Catégorie", "Montant"],
      ...st.income.map((r) => ["Résultats", r.number, r.name, r.category, Number(r.amount).toFixed(2)]),
      ...st.balance.map((r) => ["Bilan", r.number, r.name, r.category, Number(r.amount).toFixed(2)])];
    const blob = new Blob(["\uFEFF" + lines.map((l) => l.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `etats-${st.from}-${st.to}.csv`; a.click();
  };
  const Table = ({ rows, cat, label }: { rows: Row[]; cat: string; label: string }) => <div>
    <h4 className="mt-2 font-semibold">{label}</h4>
    {rows.filter((r) => r.category === cat).map((r) => <button key={r.id} className="flex w-full justify-between gap-2 border-b border-border py-1 text-left text-sm hover:bg-muted" onClick={() => onOpenAccount(r.id, cat === "revenus" || cat === "depenses" ? p.from : "1900-01-01", p.to)}>
      <span>{r.number} · {r.name}</span><span>{fmtMoney(Number(r.amount))}</span></button>)}
    <div className="flex justify-between py-1 text-sm font-semibold"><span>Total {label.toLowerCase()}</span><span>{fmtMoney(sum(rows, cat))}</span></div>
  </div>;
  if (!st) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  const net = sum(st.income, "revenus") - sum(st.income, "depenses");
  const assets = sum(st.balance, "actif"), liab = sum(st.balance, "passif"), eq = sum(st.balance, "capitaux");
  return <div className="space-y-4">
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-sm">Du<Input type="date" value={p.from} onChange={(e) => setP({ ...p, from: e.target.value })} /></label>
      <label className="text-sm">Au<Input type="date" value={p.to} onChange={(e) => setP({ ...p, to: e.target.value })} /></label>
      <Button variant="outline" onClick={csv}>Exporter (CSV)</Button>
    </div>
    <p className="text-xs text-muted-foreground">{st.company} · {st.from} au {st.to} · {st.currency} · écritures validées seulement{st.drafts_in_period ? ` · ${st.drafts_in_period} brouillon(s) non inclus` : ""}. Cliquez une ligne pour ouvrir ses mouvements au grand livre.</p>
    <section className="rounded-md border border-border p-3"><h3 className="font-display font-semibold">État des résultats</h3>
      <Table rows={st.income} cat="revenus" label="Revenus" /><Table rows={st.income} cat="depenses" label="Dépenses" />
      <div className="flex justify-between border-t border-border pt-2 font-bold"><span>Résultat net de la période</span><span>{fmtMoney(net)}</span></div>
    </section>
    <section className="rounded-md border border-border p-3"><h3 className="font-display font-semibold">Bilan au {st.to}</h3>
      <Table rows={st.balance} cat="actif" label="Actif" /><Table rows={st.balance} cat="passif" label="Passif" /><Table rows={st.balance} cat="capitaux" label="Capitaux propres" />
      <div className="flex justify-between text-sm"><span>Résultat cumulé non clôturé</span><span>{fmtMoney(Number(st.result_cumul))}</span></div>
      <div className="flex justify-between border-t border-border pt-2 font-bold"><span>Actif − (passif + capitaux + résultat)</span><span>{fmtMoney(assets - (liab + eq + Number(st.result_cumul)))}</span></div>
    </section>
  </div>;
}

/** FIN-15 — Dossier de fin d'exercice : classeur Excel regroupant les rapports serveur existants (aucun recalcul). */
async function yearEndFile(companyId: string, y: Year) {
  const XLSX = await import("xlsx");
  const call = async (fn: string, args: object) => { const { data, error } = await db.rpc(fn, args); if (error) throw error; return data; };
  const [st, tb, cf, ap] = await Promise.all([
    call("fin_gl_statements", { _company: companyId, _from: y.start_date, _to: y.end_date }),
    call("fin_gl_trial", { _company: companyId, _to: y.end_date }),
    call("fin_gl_cash_flow", { _company: companyId, _from: y.start_date, _to: y.end_date }),
    call("fin_ap_aging", { _company: companyId, _on: y.end_date }),
  ]);
  const n = (v: unknown) => (v == null ? "À compléter" : Number(v));
  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: unknown[][]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  add("Résumé", [["Entreprise", st.company], ["Exercice", y.label], ["Période", `${y.start_date} au ${y.end_date}`], ["Statut", y.status === "closed" ? "Fermé" : "Ouvert (provisoire)"], ["Devise", st.currency],
    ["Écritures en brouillon dans la période", st.drafts_in_period], ["Soldes d'ouverture", y.opening_entry_id ? "Saisis" : "À compléter"], ["Préparé le", new Date().toISOString()],
    ["Note", "Document de travail non transmis à aucune autorité; calculé depuis les écritures validées seulement."]]);
  add("Balance", [["Compte", "Nom", "Catégorie", "Débit", "Crédit", "Solde"], ...(tb as any[]).map((r) => [r.number, r.name, r.category, n(r.debit), n(r.credit), n(r.balance)])]);
  add("Résultats", [["Compte", "Nom", "Catégorie", "Montant"], ...st.income.map((r: Row) => [r.number, r.name, r.category, n(r.amount)])]);
  add("Bilan", [["Compte", "Nom", "Catégorie", "Montant"], ...st.balance.map((r: Row) => [r.number, r.name, r.category, n(r.amount)]), [], ["Résultat cumulé", "", "", n(st.result_cumul)]]);
  add("Flux de trésorerie", [["Ouverture", n(cf.opening)], ["Variation nette", n(cf.net_change)], ["Clôture", n(cf.closing)], [], ["Compte", "Nom", "Catégorie", "Entrées", "Sorties", "Net"],
    ...cf.rows.map((r: any) => [r.number, r.name, r.category, n(r.inflow), n(r.outflow), n(r.net)])]);
  add("Âge fournisseurs", [["Fournisseur", "Reste", "Non échu", "1-30", "31-60", "61-90", "90+", "Échéance inconnue", "Disponibles"],
    ...ap.rows.map((r: any) => [r.name, n(r.rest), n(r.not_due), n(r.b1_30), n(r.b31_60), n(r.b61_90), n(r.b90), n(r.unknown), n(r.available)])]);
  XLSX.writeFile(wb, `dossier-fin-exercice-${y.label}.xlsx`);
}
