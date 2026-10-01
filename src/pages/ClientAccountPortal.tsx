// FIN-10 — portail client privé : un compte autorisé ne voit que le dossier (entreprise, client) qui lui est accordé.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { useAuthReady } from "@/hooks/useAuthReady";
import { todayIn } from "@/lib/finances/period";
import { makeGuard } from "@/lib/finances/recurring";
import { renderInvoicePdf, type InvoicePdfData } from "@/lib/finances/invoicePdf";
import * as AR from "@/lib/finances/accounts";

type J = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const pdfOf = (d: J): InvoicePdfData => ({ status: "emise", isTest: !!d.is_test, number: d.number, issueDate: d.issue_date, dueDate: d.due_date, terms: d.terms,
  seller: d.seller_snapshot ?? {}, client: d.client_snapshot ?? {}, lines: d.lines ?? [], tax: d.tax_snapshot,
  template: { color: d.template_snapshot?.color ?? d.template_snapshot?.brand_color, footer: d.template_snapshot?.footer, version: d.template_snapshot?.version }, logo: null,
  progress: d.tax_snapshot?.progress ?? null, recurring: d.tax_snapshot?.recurring ?? null, construction: d.tax_snapshot?.construction ?? null });

export default function ClientAccountPortal() {
  const { user, isReady } = useAuthReady(); const uid = user?.id ?? null;
  const [mine, setMine] = useState<J[] | null>(null); const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { setMine(null); setSel(null); if (!uid) return; AR.portalMine().then((m) => { setMine(m); if (m.length === 1) setSel(m[0].id); }, () => setMine([])); }, [uid]);
  if (!isReady) return <main className="p-6">Chargement…</main>;
  if (!uid) return <main className="p-6"><p>Connectez-vous pour consulter vos documents.</p><Link className="underline" to="/login">Connexion</Link></main>;
  return <main className="mx-auto max-w-3xl space-y-4 p-4">
    <h1 className="font-display text-2xl font-bold">Mon compte client</h1>
    {mine && !mine.length && <p className="text-sm text-muted-foreground">Aucun accès client actif sur ce compte.</p>}
    {mine && mine.length > 1 && <div className="flex flex-wrap gap-2">{mine.map((a) => <Button key={a.id} size="sm" variant={sel === a.id ? "default" : "outline"} onClick={() => setSel(a.id)}>{a.company} — {a.client}</Button>)}</div>}
    {sel && <Dossier key={`${uid}|${sel}`} access={sel} />}
  </main>;
}

function Dossier({ access }: { access: string }) {
  const [st, setSt] = useState<J | null>(null); const [err, setErr] = useState<string | null>(null); const [n, setN] = useState(0);
  const [kind, setKind] = useState<"question" | "paiement_declare" | null>(null); const [f, setF] = useState({ invoice: "", message: "", reference: "", amount: "", paid_on: "" }); const [busy, setBusy] = useState(false);
  const guard = useRef(makeGuard()).current;
  useEffect(() => { const ok = guard.take(); AR.portalStatement(access, todayIn()).then((d) => ok() && setSt(d), (e) => ok() && setErr(e.message)); return () => guard.bump(); }, [access, n, guard]);
  if (err) return <p role="alert" className="text-destructive">{err}</p>;
  if (!st) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  const doc = (id: string) => st.documents.find((d: J) => d.id === id);
  const submit = async () => {
    setBusy(true);
    try { await AR.portalRequest(access, kind!, f.invoice || null, f.message, f.reference, f.amount.replace(",", "."), f.paid_on); toast({ title: "Demande transmise", description: kind === "paiement_declare" ? "Paiement à vérifier par l'entreprise : votre solde ne change pas avant cette vérification." : "L'entreprise vous répondra." });
      setKind(null); setF({ invoice: "", message: "", reference: "", amount: "", paid_on: "" }); setN((x) => x + 1); }
    catch (e) { toast({ title: "Refusé", description: (e as Error).message, variant: "destructive" }); } finally { setBusy(false); }
  };
  const t = st.totals;
  return <div className="space-y-3 text-sm" data-testid="portal-dossier">
    <p><strong>{st.seller?.name}</strong> — client {st.client?.name} · solde au {st.on} (CAD)</p>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{([["Solde restant", t.rest], ["Exigible maintenant", t.due_now], ["En retard", t.overdue], ["Retenues à échéance future", t.future_ret]] as const).map(([l, v]) => <div key={l} className="rounded border border-border p-2"><p className="text-xs text-muted-foreground">{l}</p><p className="font-semibold">{AR.money(v)}</p></div>)}</div>
    {Number(t.unallocated) > 0 && <p>Crédit non affecté : {AR.money(t.unallocated)}</p>}
    <Button size="sm" variant="outline" onClick={() => AR.statementPdf(st, "portail client").save(`etat-de-compte-${st.on}.pdf`)}>Télécharger mon état de compte (PDF)</Button>
    <h2 className="font-semibold">Mes factures</h2>
    <ul className="divide-y divide-border">{st.invoices.map((l: J) => <li key={l.invoice_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
      <span>{l.number}{l.is_test && " (TEST)"} · échéance {l.due_date ?? "non disponible"} · total {AR.money(l.total)} · solde {AR.money(l.rest)}</span>
      {doc(l.invoice_id) && <Button size="sm" variant="ghost" onClick={() => renderInvoicePdf(pdfOf(doc(l.invoice_id))).save(`${l.number}.pdf`)}>PDF</Button>}
    </li>)}{!st.invoices.length && <li className="py-2 text-muted-foreground">Aucune facture.</li>}</ul>
    <h2 className="font-semibold">Mes règlements</h2>
    <ul>{st.receipts.map((r: J) => <li key={r.id}>{r.received_on} · {r.invoice_number} · {AR.money(r.amount)}</li>)}{!st.receipts.length && <li className="text-muted-foreground">Aucun</li>}</ul>
    <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => setKind("question")}>Poser une question</Button><Button size="sm" variant="outline" onClick={() => setKind("paiement_declare")}>J'ai payé</Button></div>
    {kind && <div className="space-y-2 rounded border border-border p-2">
      <label className="block text-xs">Facture concernée (facultatif)<select className="block w-full rounded border border-border bg-background p-2" value={f.invoice} onChange={(e) => setF({ ...f, invoice: e.target.value })}><option value="">—</option>{st.invoices.map((l: J) => <option key={l.invoice_id} value={l.invoice_id}>{l.number}</option>)}</select></label>
      {kind === "paiement_declare" && <><Input placeholder="Référence du paiement (obligatoire)" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} />
        <Input placeholder="Montant (ex. 500,00)" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /><Input type="date" value={f.paid_on} onChange={(e) => setF({ ...f, paid_on: e.target.value })} /></>}
      <Textarea placeholder={kind === "question" ? "Votre question" : "Précision (facultatif)"} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
      <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={submit}>Envoyer à l'entreprise</Button><Button size="sm" variant="ghost" onClick={() => setKind(null)}>Annuler</Button></div>
      {kind === "paiement_declare" && <p className="text-xs text-muted-foreground">Votre déclaration reste « à vérifier » : elle ne modifie pas votre solde.</p>}
    </div>}
    <h2 className="font-semibold">Mes demandes</h2>
    <ul>{st.requests.map((r: J) => <li key={r.id}>{AR.KIND[r.kind]} · {r.created_at.slice(0, 10)}{r.reference && ` · réf. ${r.reference}`} · {r.status === "a_verifier" ? "à vérifier" : "traitée"}</li>)}{!st.requests.length && <li className="text-muted-foreground">Aucune</li>}</ul>
  </div>;
}
