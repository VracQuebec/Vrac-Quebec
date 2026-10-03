import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import PayrollSettings from "./PayrollSettings";
import { MISSING_LABELS } from "@/lib/payroll/engine";

const db = supabase as any;
const $ = (n: any) => Number(n || 0).toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
type Member = { user_id: string; full_name: string | null; email: string | null };
const esc = (t: any) => String(t ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function printStub(s: any, r: any, name: string) {
  const w = window.open("", "_blank", "width=720,height=900");
  if (!w) return toast({ title: "Fenêtre bloquée", description: "Autorise les fenêtres pour imprimer le talon.", variant: "destructive" });
  const row = (l: string, v: any) => `<tr><td>${esc(l)}</td><td style="text-align:right">${esc(v)}</td></tr>`;
  w.document.write(`<!doctype html><html lang="fr"><head><title>Talon ${esc(name)} ${esc(r.period_from)}</title>
<style>body{font-family:system-ui,sans-serif;padding:24px;max-width:640px;margin:auto}table{width:100%;border-collapse:collapse}td{padding:4px;border-bottom:1px solid #ddd}h1{font-size:18px}</style></head><body>
<h1>Talon de paie — ${esc(name)}</h1><p>Période ${esc(r.period_from)} au ${esc(r.period_to)} · Date de paie ${esc(r.pay_date)} · ${r.status === "finalise" ? "Finalisée" : "Brouillon"}</p>
<table>${row("Heures régulières", `${s.reg_hours} h × ${$(s.rate)}`)}${row("Heures supplémentaires", `${s.ot_hours} h`)}${row("Salaire", $(s.gross))}${row("Vacances", $(s.vacation))}
${row("RRQ", "−" + $(s.qpp))}${row("Assurance-emploi", "−" + $(s.ei))}${row("RQAP", "−" + $(s.qpip))}${row("Impôt fédéral", "−" + $(s.fed_tax))}${row("Impôt du Québec", "−" + $(s.qc_tax))}
<tr><td><strong>Net</strong></td><td style="text-align:right"><strong>${esc($(s.net))}</strong></td></tr></table>
${s.employer?.ytd ? `<p>Cumul de l'année : assurable ${esc($(s.employer.ytd.ins))}, RRQ ${esc($(s.employer.ytd.qpp))}, AE ${esc($(s.employer.ytd.ei))}, RQAP ${esc($(s.employer.ytd.qpip))}</p>` : ""}
<p style="font-size:11px;color:#666">Calcul estimatif — taux à valider avec Revenu Québec et l'ARC. Aucun dépôt effectué.</p>
<script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}

export default function PayrollPanel({ companyId, canManage, from, to, members, me }: { companyId: string; canManage: boolean; from: string; to: string; members: Member[]; me: string | null }) {
  const [emps, setEmps] = useState<Record<string, any>>({});
  const [runs, setRuns] = useState<any[]>([]);
  const [stubs, setStubs] = useState<any[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [rates, setRates] = useState<any>(null);
  const [payDate, setPayDate] = useState(to);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<Record<string, { rate: string; vac: string; fed: string; qc: string }>>({});

  const load = useCallback(async () => {
    const [{ data: e }, { data: r }, { data: s }, { data: rt }] = await Promise.all([
      db.from("pay_employees").select("*").eq("company_id", companyId),
      db.from("pay_runs").select("*").eq("company_id", companyId).order("period_from", { ascending: false }).limit(24),
      db.from("pay_stubs").select("*").eq("company_id", companyId).limit(500),
      db.from("pay_rates").select("*").order("year", { ascending: false }).limit(1),
    ]);
    setEmps(Object.fromEntries((e ?? []).map((x: any) => [x.user_id, x])));
    setRuns(r ?? []); setStubs(s ?? []); setRates(rt?.[0] ?? null);
  }, [companyId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPayDate(to); }, [to]);

  const call = async (fn: string, args: any, ok: string) => {
    if (busy) return; setBusy(true);
    const { error } = await db.rpc(fn, args);
    setBusy(false);
    if (error) return toast({ title: "Refusé", description: error.message, variant: "destructive" });
    toast({ title: ok }); load();
  };

  const nm = (id: string, f?: string | null) => f || members.find((m) => m.user_id === id)?.full_name || members.find((m) => m.user_id === id)?.email || "Employé";
  const myStubs = stubs.filter((s) => s.user_id === me);

  return (
    <section className="space-y-4">
      <p className="rounded-md border border-border bg-muted p-2 text-xs">
        Calcul estimatif {rates?.year}: RRQ, assurance-emploi (taux Québec), RQAP, impôt fédéral (abattement du Québec) et impôt du Québec, à partir des heures approuvées seulement.
        {!rates?.validated && " Moteur non validé : la comparaison avec WebRAS (Québec) et T4127 (fédéral) reste à faire avant toute paie réelle."} Aucun dépôt ni versement n'est effectué.
      </p>

      {canManage && (
        <>
          <h3 className="font-semibold">Taux horaires</h3>
          <ul className="space-y-2">
            {members.map((m) => {
              const cur = emps[m.user_id]; const v = edit[m.user_id] ?? { rate: String(cur?.hourly_rate ?? ""), vac: String(cur?.vacation_pct ?? 4), fed: cur?.fed_claim != null ? String(cur.fed_claim) : "", qc: cur?.qc_claim != null ? String(cur.qc_claim) : "" };
              const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
              return (
                <li key={m.user_id} className="flex flex-wrap items-end gap-2 rounded-md border border-border p-2">
                  <span className="min-w-0 basis-full truncate text-sm sm:basis-auto sm:flex-1">{nm(m.user_id, m.full_name)}</span>
                  <label className="text-xs">$/h<Input className="w-24" inputMode="decimal" value={v.rate} onChange={(e) => setEdit({ ...edit, [m.user_id]: { ...v, rate: e.target.value } })} /></label>
                  <label className="text-xs">Vacances %<Input className="w-20" inputMode="decimal" value={v.vac} onChange={(e) => setEdit({ ...edit, [m.user_id]: { ...v, vac: e.target.value } })} /></label>
                  <label className="text-xs" title="Montant personnel fédéral (TD1). Vide = montant de base.">TD1 fédéral<Input className="w-24" inputMode="decimal" placeholder="Base" value={v.fed} onChange={(e) => setEdit({ ...edit, [m.user_id]: { ...v, fed: e.target.value } })} /></label>
                  <label className="text-xs" title="Montant personnel Québec (TP-1015.3). Vide = montant de base.">TP-1015.3<Input className="w-24" inputMode="decimal" placeholder="Base" value={v.qc} onChange={(e) => setEdit({ ...edit, [m.user_id]: { ...v, qc: e.target.value } })} /></label>
                  <Button size="sm" variant="outline" disabled={busy || !(Number(v.rate.replace(",", ".")) >= 0) || v.rate === ""}
                    onClick={() => call("pay_employee_save", { _company: companyId, _user: m.user_id, _rate: Number(v.rate.replace(",", ".")), _vac: Number(v.vac.replace(",", ".")), _fed: num(v.fed), _qc: num(v.qc), _active: true }, "Employé enregistré")}>Enregistrer</Button>
                </li>
              );
            })}
          </ul>

          <PayrollSettings companyId={companyId} members={members} runs={runs} onChanged={load} />
          <div className="flex flex-wrap items-end gap-2">
            <span className="text-sm">Période {from} → {to}</span>
            <label className="text-xs">Date de paie<Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></label>
            <Button size="sm" disabled={busy} onClick={() => call("pay_run_compute", { _company: companyId, _from: from, _to: to, _pay_date: payDate }, "Paie calculée")}>Calculer la paie</Button>
          </div>
        </>
      )}

      <h3 className="font-semibold">{canManage ? "Paies" : "Mes talons de paie"}</h3>
      {(canManage ? runs : runs.filter((r) => myStubs.some((s) => s.run_id === r.id))).map((r) => {
        const rs = stubs.filter((s) => s.run_id === r.id && (canManage || s.user_id === me));
        return (
          <div key={r.id} className="rounded-md border border-border p-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <button className="font-medium underline-offset-2 hover:underline" onClick={() => setOpen(open === r.id ? null : r.id)}>{r.period_from} → {r.period_to}</button>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{r.status === "finalise" ? "Finalisée" : "Brouillon"}</span>
              {canManage && <span className="text-xs text-muted-foreground">Brut {$(r.totals?.gross)} · Net {$(r.totals?.net)} · Charges employeur {$(r.totals?.employer)}</span>}
              {canManage && r.status !== "finalise" && <Button size="sm" variant="outline" className="ml-auto" disabled={busy} onClick={() => call("pay_run_finalize", { _run: r.id }, "Paie finalisée")}>Finaliser</Button>}
            </div>
            {open === r.id && (
              <div className="mt-2 space-y-2">
                {!rs.length && <p className="text-sm text-muted-foreground">Aucun talon : aucune heure approuvée ou taux horaire manquant.</p>}
                {rs.map((s) => (
                  <div key={s.id} className="grid grid-cols-2 gap-x-3 gap-y-0.5 rounded bg-muted/50 p-2 text-xs sm:grid-cols-4">
                    <strong className="col-span-2 text-sm sm:col-span-4">{nm(s.user_id, s.full_name)}</strong>
                    <span>Heures rég. {s.reg_hours} × {$(s.rate)}</span><span>Heures suppl. {s.ot_hours}</span>
                    <span>Salaire {$(s.gross)}</span><span>Vacances {$(s.vacation)}</span>
                    {Number(s.bonus) !== 0 && <span>Prime {$(s.bonus)}</span>}{Number(s.adjustments) !== 0 && <span>Correction {$(s.adjustments)}</span>}
                    <span>RRQ −{$(s.qpp)}</span><span>AE −{$(s.ei)}</span><span>RQAP −{$(s.qpip)}</span>
                    <span>Impôt fédéral −{$(s.fed_tax)}</span><span>Impôt Québec −{$(s.qc_tax)}</span>
                    <strong>Net {$(s.net)}</strong>
                    {s.employer?.ytd && <span className="col-span-2 text-muted-foreground sm:col-span-4">Cumul année : assurable {$(s.employer.ytd.ins)} · RRQ {$(s.employer.ytd.qpp)} · AE {$(s.employer.ytd.ei)} · RQAP {$(s.employer.ytd.qpip)}</span>}
                    {canManage && <span className="col-span-2 text-muted-foreground sm:col-span-4">Employeur : RRQ {$(s.employer?.qpp)} · AE {$(s.employer?.ei)} · RQAP {$(s.employer?.qpip)} · FSS {s.employer?.fss == null ? "non calculé (paie antérieure)" : $(s.employer.fss)} · Normes {s.employer?.normes == null ? "—" : $(s.employer.normes)} · CNESST {s.employer?.cnesst == null ? "non calculé (paie antérieure)" : s.employer.cnesst_missing ? "à compléter" : $(s.employer.cnesst)}</span>}
                    {canManage && (s.employer?.missing ?? []).length > 0 && <span className="col-span-2 text-destructive sm:col-span-4">Manquant : {(s.employer.missing as string[]).map((k) => MISSING_LABELS[k] ?? k).join(" · ")}</span>}
                    <Button size="sm" variant="outline" className="col-span-2 mt-1 justify-self-start sm:col-span-4" onClick={() => printStub(s, r, nm(s.user_id, s.full_name))}>Imprimer / PDF</Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <YearSlips companyId={companyId} canManage={canManage} />
    </section>
  );
}

function YearSlips({ companyId, canManage }: { companyId: string; canManage: boolean }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setRows(null); setErr(null);
    db.rpc("pay_year_slips", { _company: companyId, _year: year }).then(({ data, error }: any) => error ? setErr(error.message) : setRows(data ?? []));
  }, [companyId, year]);
  const print = (s: any) => {
    const w = window.open("", "_blank", "width=720,height=900");
    if (!w) return toast({ title: "Fenêtre bloquée", description: "Autorise les fenêtres pour imprimer.", variant: "destructive" });
    const row = (c: string, l: string, v: any) => `<tr><td>${esc(c)}</td><td>${esc(l)}</td><td style="text-align:right">${esc($(v))}</td></tr>`;
    w.document.write(`<!doctype html><html lang="fr"><head><title>Sommaire ${year} ${esc(s.name)}</title><style>body{font-family:system-ui,sans-serif;padding:24px;max-width:640px;margin:auto}table{width:100%;border-collapse:collapse}td{padding:4px;border-bottom:1px solid #ddd}</style></head><body>
<h1 style="font-size:18px">Sommaire annuel ${year} — ${esc(s.name)}</h1><p style="color:#b00">Document de préparation : ce n'est pas un feuillet officiel T4 ou RL-1 et rien n'est transmis.</p>
<h2 style="font-size:15px">T4 (fédéral)</h2><table>${row("14", "Revenus d'emploi", s.income)}${row("17", "Cotisations RRQ", s.qpp)}${row("18", "Cotisations AE", s.ei)}${row("55", "Cotisations RPAP (RQAP)", s.qpip)}${row("22", "Impôt fédéral retenu", s.fed_tax)}</table>
<h2 style="font-size:15px">RL-1 (Québec)</h2><table>${row("A", "Revenus d'emploi", s.income)}${row("B", "Cotisations RRQ", s.qpp)}${row("C", "Cotisations AE", s.ei)}${row("H", "Cotisations RQAP", s.qpip)}${row("E", "Impôt du Québec retenu", s.qc_tax)}</table>
<p style="font-size:11px;color:#666">${s.runs} paie(s) finalisée(s). Taux à valider avec Revenu Québec et l'ARC.</p><script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };
  return (
    <div className="space-y-2 border-t border-border pt-4">
      <div className="flex flex-wrap items-end gap-2">
        <h3 className="font-semibold">{canManage ? "Sommaires annuels T4 / RL-1" : "Mon sommaire annuel"}</h3>
        <label className="text-xs">Année<Input className="w-24" type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || year)} /></label>
      </div>
      <p className="text-xs text-muted-foreground">Préparation à partir des paies finalisées seulement. Ce ne sont pas des feuillets officiels et rien n'est transmis aux gouvernements.</p>
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      {rows && !rows.length && <p className="text-sm text-muted-foreground">Aucune paie finalisée en {year}.</p>}
      {rows?.map((s) => (
        <div key={s.user_id} className="grid grid-cols-2 gap-x-3 gap-y-0.5 rounded bg-muted/50 p-2 text-xs sm:grid-cols-4">
          <strong className="col-span-2 text-sm sm:col-span-4">{s.name || "Employé"} · {s.runs} paie(s)</strong>
          <span>Revenus {$(s.income)}</span><span>RRQ {$(s.qpp)}</span><span>AE {$(s.ei)}</span><span>RQAP {$(s.qpip)}</span>
          <span>Impôt fédéral {$(s.fed_tax)}</span><span>Impôt Québec {$(s.qc_tax)}</span>
          <Button size="sm" variant="outline" className="col-span-2 mt-1 justify-self-start sm:col-span-4" onClick={() => print(s)}>Imprimer / PDF</Button>
        </div>
      ))}
    </div>
  );
}
