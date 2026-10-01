// FIN-09C2B2B2A — analyse LECTURE SEULE d'un paiement de retenue construction TEST.
// Aucune action financière : explique la route (B2B1 admise ou refus) et les prérequis; données absentes affichées « non disponible », jamais 0.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuthReady } from "@/hooks/useAuthReady";
import { makeGuard } from "@/lib/finances/recurring";
import * as RT from "@/lib/finances/retention";

type J = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const ND = "non disponible";
const money = (n?: number | string | null) => { if (n == null || n === "" || typeof n === "boolean") return ND; const v = Number(n); return Number.isFinite(v) ? v.toLocaleString("fr-CA", { style: "currency", currency: "CAD" }) : ND; };
const txt = (s?: string | null) => s == null || s === "" ? ND : s;

export default function ConstructionPayAnalysisTest({ rel, companyId, rev }: { rel: J; companyId: string; rev?: number | null }) {
  const { user } = useAuthReady(); const uid = user?.id ?? null;
  const [data, setData] = useState<J | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const guard = useRef(makeGuard()).current;
  const ctx = `${uid}|${companyId}|${rel.id}|${rev ?? ""}|${rel.voided_at ?? ""}|${rel.amount ?? ""}|${rel.released_on ?? ""}`; const ctxRef = useRef(ctx);
  if (ctxRef.current !== ctx) { ctxRef.current = ctx; guard.bump(); if (data || err || busy) { setData(null); setErr(null); setBusy(false); } }
  useEffect(() => () => guard.bump(), [guard]);
  if (!uid) return null;
  const run = async () => {
    const ok = guard.take(); setBusy(true); setErr(null); setData(null);
    try { const r = await RT.pcorrAnalyze(rel.id); if (ok()) setData(r); }
    catch (e) { if (ok()) setErr((e as Error)?.message ?? "Erreur"); } finally { if (ok()) setBusy(false); }
  };
  const ev = (e: J, k: number) => <li key={k}>{txt(e.source)} · exigible {txt(e.exigible_on)} · base {money(e.base)} · TPS {money(e.gst)} · TVQ {money(e.qst)} · TTC {money(e.ttc)} (cumul {money(e.cum_ttc)})</li>;
  return <div className="mt-1" data-testid="pcorr-analysis">
    <Button size="sm" variant="ghost" disabled={busy} onClick={run}>Analyser la correction (TEST, lecture seule)</Button>
    {err && <p role="alert" className="text-destructive">{err}</p>}
    {data && <div data-testid="pcorr-analysis-result" className="mt-1 space-y-1 rounded border border-dashed border-border p-2">
      <p className="font-medium">{data.label}</p>
      <p>{data.route === "b2b1" ? "Cas admis par B2B1 : utilisez « Annuler une erreur de saisie (TEST)… » (parcours inchangé)." : "Correction refusée en l'état — aucune annulation fiscale disponible (sous-lot B2B2B à définir)."}</p>
      {data.route !== "b2b1" && <ul className="list-disc pl-4" data-testid="pcorr-reasons">{(data.reasons ?? []).map((r: string, k: number) => <li key={k}>{r}</li>)}</ul>}
      {(data.missing ?? []).length > 0 && <p data-testid="pcorr-missing">Données insuffisantes : {data.missing.join(" ; ")}</p>}
      {(data.ambiguities ?? []).length > 0 && <p data-testid="pcorr-amb">Ordre ambigu : {data.ambiguities.join(" ; ")}</p>}
      <p>Contexte : facture {txt(data.invoice_number)} {data.is_test ? "TEST" : "non TEST"} ({txt(data.invoice_status)}) · retenue {txt(data.retention_status)} rév. {data.rev ?? ND}</p>
      <p>Paiement : {money(data.payment?.amount)} le {txt(data.payment?.paid_on)} · échéance contractuelle figée : {txt(data.contractual_due)} · encaissement lié : {data.receipt ? `${money(data.receipt.amount)} le ${txt(data.receipt.received_on)} (réf. ${txt(data.receipt.reference)})${data.receipt.voided_at ? " — annulé" : ""}` : ND}</p>
      <p>Instantané facture (immuable) : base {money(data.snapshot?.base)} · TPS {money(data.snapshot?.gst)} · TVQ {money(data.snapshot?.qst)} · TTC {money(data.snapshot?.ttc)}</p>
      <p>Solde actuel : reste {money(data.position?.rest)} · retenu {money(data.position?.held)} · courant exigible {money(data.position?.current_due)}</p>
      <div>Exigibilité fiscale — événements liés à ce paiement : {(data.linked_tax_events ?? []).length ? <ul className="pl-4">{data.linked_tax_events.map(ev)}</ul> : "aucun"}</div>
      <div>Événements fiscaux ultérieurs : {(data.later_tax_events ?? []).length ? <ul className="pl-4">{data.later_tax_events.map(ev)}</ul> : "aucun"}</div>
      <p>Paiements ultérieurs actifs : {(data.later_payments ?? []).length ? data.later_payments.map((p: J) => `${money(p.amount)} le ${txt(p.paid_on)}`).join(", ") : "aucun"} · corrections existantes : {(data.corrections ?? []).length}</p>
    </div>}
  </div>;
}
