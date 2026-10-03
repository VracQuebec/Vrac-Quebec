import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

const db = supabase as any;
const $ = (n: any) => Number(n || 0).toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
type Member = { user_id: string; full_name: string | null; email: string | null };

export default function PayrollPanel({ companyId, canManage, from, to, members, me }: { companyId: string; canManage: boolean; from: string; to: string; members: Member[]; me: string | null }) {
  const [emps, setEmps] = useState<Record<string, any>>({});
  const [runs, setRuns] = useState<any[]>([]);
  const [stubs, setStubs] = useState<any[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [rates, setRates] = useState<any>(null);
  const [payDate, setPayDate] = useState(to);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<Record<string, { rate: string; vac: string }>>({});

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
        {!rates?.validated && " Taux à valider avec Revenu Québec et l'ARC avant toute paie réelle."} Aucun dépôt ni versement n'est effectué.
      </p>

      {canManage && (
        <>
          <h3 className="font-semibold">Taux horaires</h3>
          <ul className="space-y-2">
            {members.map((m) => {
              const cur = emps[m.user_id]; const v = edit[m.user_id] ?? { rate: String(cur?.hourly_rate ?? ""), vac: String(cur?.vacation_pct ?? 4) };
              return (
                <li key={m.user_id} className="flex flex-wrap items-end gap-2 rounded-md border border-border p-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{nm(m.user_id, m.full_name)}</span>
                  <label className="text-xs">$/h<Input className="w-24" inputMode="decimal" value={v.rate} onChange={(e) => setEdit({ ...edit, [m.user_id]: { ...v, rate: e.target.value } })} /></label>
                  <label className="text-xs">Vacances %<Input className="w-20" inputMode="decimal" value={v.vac} onChange={(e) => setEdit({ ...edit, [m.user_id]: { ...v, vac: e.target.value } })} /></label>
                  <Button size="sm" variant="outline" disabled={busy || !(Number(v.rate.replace(",", ".")) >= 0) || v.rate === ""}
                    onClick={() => call("pay_employee_save", { _company: companyId, _user: m.user_id, _rate: Number(v.rate.replace(",", ".")), _vac: Number(v.vac.replace(",", ".")), _fed: null, _qc: null, _active: true }, "Taux enregistré")}>Enregistrer</Button>
                </li>
              );
            })}
          </ul>

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
                    <span>RRQ −{$(s.qpp)}</span><span>AE −{$(s.ei)}</span><span>RQAP −{$(s.qpip)}</span>
                    <span>Impôt fédéral −{$(s.fed_tax)}</span><span>Impôt Québec −{$(s.qc_tax)}</span>
                    <strong>Net {$(s.net)}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
