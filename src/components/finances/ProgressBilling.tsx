// FIN-09B1 — Dossiers de facturation progressive (acomptes, situations cumulatives, solde final).
// L'écran n'affiche que ce que le serveur calcule; il ne décide d'aucun plafond.
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { todayIn, fmtDate } from "@/lib/finances/period";
import * as P from "@/lib/finances/progress";

const sel = "h-10 rounded-md border border-input bg-background px-2 text-sm";
const money = (n?: number | null) =>
  n == null ? "—" : Number(n).toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
const STATUS: Record<P.Situation["status"], string> = {
  brouillon: "Brouillon (non facturé)",
  emise: "Émise",
  abandonnee: "Abandonnée",
};

export function ProgressPlans({
  companyId,
  onOpen,
  refreshKey,
}: {
  companyId: string;
  onOpen: (id: string) => void;
  refreshKey?: number;
}) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof P.listPlans>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setRows(null);
    setErr(null);
    P.listPlans(companyId)
      .then((r) => live && setRows(r))
      .catch((e) => live && setErr(e.message));
    return () => {
      live = false;
    };
  }, [companyId, refreshKey]);
  if (err)
    return (
      <p role="alert" className="text-sm text-destructive">
        Dossiers progressifs illisibles : {err}
      </p>
    );
  if (!rows?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-2">
      <p className="text-sm font-semibold">Facturation progressive (dossiers)</p>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.id}>
            <button
              className="flex w-full flex-wrap justify-between gap-2 p-2 text-left text-sm"
              onClick={() => onOpen(r.id)}
            >
              <span>
                Soumission {r.quote_number ?? ""} v{r.quote_version ?? 1} · {r.client_name ?? "Client"}
                {r.has_draft ? " · brouillon en cours" : ""}
              </span>
              <span>
                Facturé {money(r.billed_total)} / contrat {money(r.contract_total)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Form = { kind: P.Kind; mode: P.Mode; value: string; issue: string; due: string };

export default function ProgressPlanDialog({
  planId,
  companyId,
  canWrite,
  onClose,
  onOpenInvoice,
  onChanged,
}: {
  planId: string;
  companyId: string;
  canWrite: boolean;
  onClose: () => void;
  onOpenInvoice: (id: string) => void;
  onChanged: () => void;
}) {
  const [sum, setSum] = useState<P.Summary | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [form, setForm] = useState<Form>({ kind: "acompte", mode: "pct", value: "", issue: todayIn(), due: "" });
  const [draft, setDraft] = useState<{ key: string; rev: number | null } | null>(null); // brouillon serveur repris ou créé
  const [preview, setPreview] = useState<P.Situation | null>(null); // aperçu valide pour le formulaire affiché
  const [pending, setPending] = useState<{ id: string; key: string; rev: number; hash: string } | null>(null); // rejeu après réponse perdue
  const [abandonOpen, setAbandonOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pendingAb, setPendingAb] = useState<{
    id: string;
    key: string;
    reason: string;
    rev: number;
    hash: string;
  } | null>(null); // rejeu exact de l'abandon
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const gen = useRef(0); // contexte (dossier/entreprise) : toute réponse d'un ancien contexte est ignorée
  const seq = useRef(0); // ordre des lectures du résumé
  const formRev = useRef(0); // version du formulaire : un aperçu ne vaut que pour la saisie envoyée

  const load = useCallback(async () => {
    const q = ++seq.current;
    setLoadErr(null);
    try {
      const s = await P.summary(planId);
      if (q === seq.current) setSum(s);
    } catch (e) {
      if (q === seq.current) setLoadErr((e as Error).message);
    }
  }, [planId]);
  useEffect(() => {
    gen.current++;
    formRev.current++;
    setSum(null);
    setDraft(null);
    setPreview(null);
    setPending(null);
    setPendingAb(null);
    setAbandonOpen(false);
    setReason("");
    setBusy(false);
    setErr(null);
    void load();
    return () => {
      gen.current++;
      seq.current++;
    };
  }, [load, companyId]);

  const active = sum?.situations.find((s) => s.status === "brouillon") ?? null;
  const edit = (p: Partial<Form>) => {
    if (busy) return;
    formRev.current++;
    setForm((f) => ({ ...f, ...p }));
    setPreview(null);
    setPending(null);
    setErr(null);
  };
  const resume = () => {
    if (!active || busy) return;
    formRev.current++;
    setForm({
      kind: active.kind,
      mode: active.mode,
      value: active.kind === "solde" ? "" : active.value.replace(".", ","),
      issue: active.issue_date ?? todayIn(),
      due: active.due_date ?? "",
    });
    setDraft({ key: active.draft_key, rev: active.rev });
    setPreview(active);
    setPending(null);
    setErr(null);
  };

  const doPreview = async () => {
    if (busy || !sum) return;
    setErr(null);
    const value = form.kind === "solde" ? null : P.parseCumul(form.value);
    if (form.kind !== "solde" && value == null) {
      setErr("Cumul invalide : nombre positif, au plus 2 décimales (ex. 30 ou 1 250,50).");
      return;
    }
    if (active && !draft) {
      setErr("Un brouillon existe déjà : reprenez-le ou abandonnez-le.");
      return;
    }
    const d = draft ?? { key: P.newKey(), rev: null };
    if (!draft) setDraft(d);
    const g = gen.current;
    const fr = formRev.current;
    setBusy(true);
    try {
      const s = await P.saveDraft({
        plan: planId,
        key: d.key,
        kind: form.kind,
        mode: form.mode,
        value,
        issue: form.issue,
        due: form.due,
        baseRev: d.rev,
      });
      if (g !== gen.current) return;
      setDraft({ key: d.key, rev: s.rev });
      if (fr !== formRev.current) {
        setPreview(null);
        setErr("La saisie a changé pendant l'aperçu : refaites l'aperçu.");
      } else setPreview(s);
      void load();
    } catch (e) {
      if (g === gen.current) setErr((e as Error).message);
    } finally {
      if (g === gen.current) setBusy(false);
    }
  };
  const doIssue = async () => {
    if (busy || !preview) return;
    const req = pending ?? { id: preview.id, key: P.newKey(), rev: preview.rev, hash: preview.hash };
    setPending(req);
    const g = gen.current;
    setBusy(true);
    setErr(null);
    try {
      const r = await P.issue(req.id, req.key, req.rev, req.hash);
      if (g !== gen.current) return;
      formRev.current++;
      setPending(null);
      setPreview(null);
      setDraft(null);
      setForm({ kind: "situation", mode: form.mode, value: "", issue: todayIn(), due: "" });
      await load();
      if (g !== gen.current) return;
      onChanged();
      setErr(null);
      window.alert(`Facture ${r.number} ${r.already ? "déjà émise" : "émise"}. Émise ne veut pas dire envoyée.`);
    } catch (e) {
      if (g !== gen.current) return;
      const x = e as Error & { code?: string };
      if (x.code === "P0409") {
        setPending(null);
        setPreview(null);
        setErr(`${x.message} Aucune émission automatique : refaites l'aperçu.`);
        void load();
      } else setErr(`${x.message} Vous pouvez réessayer : la même demande sera renvoyée (aucun doublon).`);
    } finally {
      if (g === gen.current) setBusy(false);
    }
  };
  const doAbandon = async () => {
    if (busy) return;
    const req =
      pendingAb ??
      (active && reason.trim()
        ? { id: active.id, key: P.newKey(), reason: reason.trim(), rev: active.rev, hash: active.hash }
        : null);
    if (!req) {
      setErr("Motif d'abandon requis.");
      return;
    }
    setPendingAb(req);
    const g = gen.current;
    setBusy(true);
    setErr(null);
    try {
      await P.abandon(req.id, req.key, req.reason, req.rev, req.hash);
      if (g !== gen.current) return;
      formRev.current++;
      setPendingAb(null);
      setAbandonOpen(false);
      setReason("");
      setDraft(null);
      setPreview(null);
      setPending(null);
      await load();
      if (g !== gen.current) return;
      onChanged();
    } catch (e) {
      if (g !== gen.current) return;
      const x = e as Error & { code?: string };
      if (x.code === "P0409") {
        setPendingAb(null);
        setAbandonOpen(false);
        setDraft(null);
        setPreview(null);
        setErr(`${x.message} Le brouillon actuel a été rechargé : vérifiez-le avant toute action.`);
        void load();
      } else
        setErr(`${x.message} Vous pouvez réessayer : le même abandon sera renvoyé (même motif, aucune autre clé).`);
    } finally {
      if (g === gen.current) setBusy(false);
    }
  };

  if (loadErr)
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent>
          <p role="alert">Dossier illisible : {loadErr}</p>
          <Button onClick={load}>Réessayer</Button>
        </DialogContent>
      </Dialog>
    );
  if (!sum)
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent>
          <p>Chargement…</p>
        </DialogContent>
      </Dialog>
    );
  if (sum.company_id !== companyId)
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent>
          <p role="alert">Ce dossier n'appartient pas à l'entreprise sélectionnée : affichage et actions refusés.</p>
        </DialogContent>
      </Dialog>
    );
  const c = sum.contract;
  const issued = sum.situations.filter((s) => s.status === "emise");
  const credits = issued.reduce((a, s) => a + Number(s.balance?.credits ?? 0), 0);
  const collected = issued.reduce((a, s) => a + Number(s.balance?.collected ?? 0), 0);
  const ttc = Boolean((c as unknown as { prices_include_tax?: boolean }).prices_include_tax);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const capLeft = ttc ? r2(Number(c.total) - Number(sum.billed.total)) : r2(Number(c.ht) - Number(sum.billed.ht));
  const full = capLeft <= 0;
  const gapNote = (g?: P.Gap | null) =>
    g && [g.ht, g.gst, g.qst, g.total].some((value) => Number(value) !== 0) ? (
      <p className="text-xs">
        Écart d'arrondi par rapport à l'estimation de la soumission : HT {money(g.ht)} · TPS {money(g.gst)} · TVQ{" "}
        {money(g.qst)} · TTC {money(g.total)}. Les taxes de chaque facture sont calculées sur sa propre part; cet écart
        n'est pas absorbé dans la taxe.
      </p>
    ) : null;
  const lastGap = issued.length ? issued[issued.length - 1].computed.gap_vs_quote : null;
  const pv = preview?.computed;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Facturation progressive — soumission {sum.quote_number ?? ""} v{sum.quote_version ?? 1}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm">
          {sum.client_name ?? "Client"} · contrat figé (lignes, remises et taxes de la soumission acceptée). Plafond
          contractuel : {ttc ? `${money(c.total)} TTC (prix taxes incluses)` : `${money(c.ht)} HT`}.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th></th>
              <th>HT</th>
              <th>TPS</th>
              <th>TVQ</th>
              <th>TTC</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Contrat (estimation de la soumission)</td>
              <td>{money(c.ht)}</td>
              <td>{money(c.gst)}</td>
              <td>{money(c.qst)}</td>
              <td>{money(c.total)}</td>
            </tr>
            <tr>
              <td>Déjà facturé</td>
              <td>{money(sum.billed.ht)}</td>
              <td>{money(sum.billed.gst)}</td>
              <td>{money(sum.billed.qst)}</td>
              <td>{money(sum.billed.total)}</td>
            </tr>
            <tr>
              <td>Reste à facturer ({ttc ? "TTC" : "HT"})</td>
              <td>{ttc ? "" : money(capLeft)}</td>
              <td></td>
              <td></td>
              <td>{ttc ? money(capLeft) : ""}</td>
            </tr>
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground">
          Encaissé sur ces factures : {money(collected)} (chaque encaissement reste sur sa facture, aucun transfert).
          Notes de crédit émises : {money(credits)} — elles réduisent le solde de la facture concernée mais ne rouvrent
          pas le montant contractuel déjà facturé. Les montants facturés sont déduits même impayés.
        </p>

        {sum.situations.length > 0 && (
          <ul className="divide-y divide-border rounded border border-border text-sm">
            {sum.situations.map((s) => (
              <li key={s.id} className="flex flex-wrap justify-between gap-2 p-2">
                <span>
                  {s.seq ? `n° ${s.seq} · ` : ""}
                  {P.KIND_LABEL[s.kind]} · cumul {s.computed.cum.pct} % ({money(s.computed.cum.ht)} HT) ·{" "}
                  {STATUS[s.status]}
                  {s.abandon_reason ? ` — motif : ${s.abandon_reason}` : ""}
                </span>
                <span>
                  {money(s.computed.new.total)}
                  {s.invoice_id && (
                    <>
                      {" "}
                      ·{" "}
                      <button className="underline" onClick={() => onOpenInvoice(s.invoice_id!)}>
                        Facture {s.number}
                      </button>
                      {s.balance
                        ? ` · net ${money(s.balance.net)} · encaissé ${money(s.balance.collected)} · reste ${money(s.balance.rest)}`
                        : ""}
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {canWrite && !full && (
          <div className="space-y-2 rounded border border-border p-2">
            {active && !draft && (
              <p role="status" className="text-sm">
                Un brouillon de situation existe (non facturé, aucun numéro).{" "}
                <Button size="sm" variant="outline" onClick={resume}>
                  Reprendre le brouillon
                </Button>{" "}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setAbandonOpen(true);
                    setErr(null);
                  }}
                >
                  Abandonner…
                </Button>
              </p>
            )}
            {(!active || draft) && (
              <>
                <fieldset disabled={busy} aria-busy={busy} className="grid gap-2 sm:grid-cols-5">
                  <select
                    aria-label="Type"
                    className={sel}
                    value={form.kind}
                    onChange={(e) => edit({ kind: e.target.value as P.Kind })}
                  >
                    {(Object.keys(P.KIND_LABEL) as P.Kind[]).map((k) => (
                      <option key={k} value={k}>
                        {P.KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                  {form.kind !== "solde" && (
                    <select
                      aria-label="Mode"
                      className={sel}
                      value={form.mode}
                      onChange={(e) => edit({ mode: e.target.value as P.Mode })}
                    >
                      <option value="pct">Cumul en % du contrat</option>
                      {ttc ? (
                        <option value="amount_ttc">Cumul en montant TTC</option>
                      ) : (
                        <option value="amount">Cumul en montant HT</option>
                      )}
                    </select>
                  )}
                  {form.kind !== "solde" && (
                    <Input
                      aria-label="Cumul contractuel"
                      inputMode="decimal"
                      placeholder={form.mode === "pct" ? "ex. 30" : "ex. 300,00"}
                      value={form.value}
                      onChange={(e) => edit({ value: e.target.value })}
                    />
                  )}
                  <label className="text-xs">
                    Date de facture
                    <Input type="date" value={form.issue} onChange={(e) => edit({ issue: e.target.value })} />
                  </label>
                  <label className="text-xs">
                    Échéance
                    <Input type="date" value={form.due} onChange={(e) => edit({ due: e.target.value })} />
                  </label>
                </fieldset>
                <p className="text-xs text-muted-foreground">
                  Saisissez le CUMUL contractuel facturé à ce jour (pas le montant de cette facture). Une facture
                  d'acompte facture une part du prix : ce n'est ni un dépôt remboursable ni une préautorisation
                  bancaire.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={busy} onClick={doPreview}>
                    Aperçu
                  </Button>
                  {preview && (
                    <Button disabled={busy} onClick={doIssue}>
                      {pending ? "Réessayer l'émission" : "Émettre la facture"}
                    </Button>
                  )}
                  {active && (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        setAbandonOpen(true);
                        setErr(null);
                      }}
                    >
                      Abandonner le brouillon…
                    </Button>
                  )}
                </div>
              </>
            )}
            {(abandonOpen || pendingAb) && active && (
              <div className="space-y-2 rounded border border-border p-2" aria-label="Abandon du brouillon">
                <label className="text-xs">
                  Motif de l'abandon (conservé dans l'historique)
                  <Input
                    aria-label="Motif de l'abandon"
                    value={pendingAb ? pendingAb.reason : reason}
                    disabled={busy || !!pendingAb}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" disabled={busy} onClick={doAbandon}>
                    {pendingAb ? "Réessayer l'abandon" : "Confirmer l'abandon"}
                  </Button>
                  {!pendingAb && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        setAbandonOpen(false);
                        setReason("");
                      }}
                    >
                      Annuler
                    </Button>
                  )}
                </div>
              </div>
            )}
            {pv && (
              <div className="rounded bg-muted p-2 text-sm" aria-label="Aperçu de la situation">
                <p>
                  Cumul après cette facture : {pv.cum.pct} % · {money(pv.cum.ht)} HT · {money(pv.cum.total)} TTC
                </p>
                <p className="font-semibold">
                  Nouveau montant à facturer : {money(pv.new.ht)} HT + TPS {money(pv.new.gst)} + TVQ {money(pv.new.qst)}{" "}
                  = {money(pv.new.total)}
                </p>
                <p>
                  Restera à facturer :{" "}
                  {ttc
                    ? `${money(pv.remaining.cap ?? pv.remaining.total)} TTC`
                    : `${money(pv.remaining.cap ?? pv.remaining.ht)} HT`}
                </p>
                {gapNote(pv.gap_vs_quote)}
                <p className="text-xs text-muted-foreground">
                  Aperçu serveur : rien n'est facturé ni numéroté tant que vous n'émettez pas. Toute modification retire
                  « Émettre ».
                </p>
              </div>
            )}
            {err && (
              <p role="alert" className="rounded border border-destructive/50 bg-destructive/10 p-2 text-sm">
                {err}
              </p>
            )}
          </div>
        )}
        {full && (
          <p className="text-sm">
            Contrat entièrement facturé. Toute correction passe par une note de crédit sur la facture concernée.
          </p>
        )}
        {full && gapNote(lastGap)}
        {issued.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Dernière facture le {fmtDate(issued[issued.length - 1].issue_date)}.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
