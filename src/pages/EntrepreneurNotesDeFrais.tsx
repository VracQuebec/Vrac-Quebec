// FIN-12D — « Mes notes de frais » : accès employé à ses seules notes/avances, sans ouvrir les autres sections Finances.
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import ExpenseReports from "@/components/finances/ExpenseReports";
import { useAuthReady } from "@/hooks/useAuthReady";
import * as X from "@/lib/finances/expenses";

export default function EntrepreneurNotesDeFrais() {
  const { user, isReady } = useAuthReady();
  const [params, setParams] = useSearchParams();
  const [list, setList] = useState<X.Company[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const companyId = params.get("company") || (list?.length === 1 ? list[0].id : "");
  useEffect(() => { if (!isReady || !user) return; X.myCompanies().then(setList).catch((e) => setErr(e.message)); }, [isReady, user]);
  const co = list?.find((c) => c.id === companyId);
  return <EntrepreneurAppShell title="Mes notes de frais" subtitle={co?.name ?? ""} allowCompanyMembers>
    <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6">
      {err && <p role="alert" className="text-destructive">{err}</p>}
      {!list ? <p className="text-muted-foreground">Chargement…</p> : list.length === 0 ? <p className="text-muted-foreground">Aucune entreprise ne vous rattache comme membre.</p> : <>
        {list.length > 1 && <select aria-label="Entreprise" className="mb-4 h-10 rounded-md border border-input bg-background px-2 text-sm" value={companyId} onChange={(e) => { const p = new URLSearchParams(params); p.set("company", e.target.value); setParams(p); }}>
          <option value="">— Choisir une entreprise —</option>{list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
        {co ? <ExpenseReports key={co.id} companyId={co.id} mine canApprove={false} canCorrect={false} /> : <p className="text-muted-foreground">Choisissez une entreprise.</p>}
      </>}
    </div>
  </EntrepreneurAppShell>;
}
