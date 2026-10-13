import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { CAT_STATE_LABEL, estimateCredits } from "@/lib/seo/catalogStatus";
import { ACTION_LABEL, emptyReason, rowsForAction, summarizeWorkbench, type WbAction, type WbRow } from "@/lib/seo/cityWorkbench";
import { validReason, type Decision } from "@/lib/seo/slotDecisions";

export type RowResult = { ok: boolean; msg: string };
type Runner = (rows: WbRow[]) => Promise<Map<string, RowResult>>;
export type DecideRunner = (rows: WbRow[], decision: Decision, reason: string) => Promise<Map<string, RowResult>>;
type RunAction = Exclude<WbAction, "none" | "decide">;

// Poste de travail d'une ville : vérification détaillée, sélection, actions manuelles et résultat par page.
// Rien n'est lancé sans clic + confirmation; chaque action ne vise que les lignes admissibles cochées.
export type Evidence = { submission_number: string | null; material_slug: string; evidence: string; origin: string; materials: string[] | null };
const ORIGIN_LABEL: Record<string, string> = { "/remblai": "formulaire remblai (besoin de remplissage)", "/depot-materiaux": "dépôt de matériaux (terre à SORTIR)", non_indiquee: "origine non indiquée" };
const AVAIL_LABEL: Record<string, string> = { confirmee: "confirmée", inconnue: "inconnue", exclue: "exclue" };

function pageLine(r: WbRow): string {
  if (r.state.startsWith("published")) return `Page en ligne /${r.pageSlug}`;
  if (r.pageId) return `Brouillon /${r.pageSlug} — note ${r.qaScore ?? "absente"}${r.qaScore != null && !r.qaFresh ? " (périmée)" : ""}`;
  return "Aucune page";
}

export default function CityWorkbenchDialog({ city, rows, loadState = "ok", focus = null, onClose, onVerify, run, onDecideRows, evidence = [] }: {
  city: { slug: string; name: string } | null; rows: WbRow[]; evidence?: Evidence[];
  /** « loading » / « error » : les données de la ville ne sont pas complètes — aucun chiffre n'est présenté comme définitif. */
  loadState?: "loading" | "error" | "ok";
  /** Section à afficher en premier (bouton de la fiche de ville utilisé pour ouvrir la fenêtre). */
  focus?: WbAction | null;
  onClose: () => void; onVerify: () => Promise<void>;
  run: Partial<Record<RunAction, Runner>>;
  onDecideRows?: DecideRunner;
}) {
  const [sel, setSel] = useState<Record<string, Set<string>>>({});
  const [results, setResults] = useState<Map<string, RowResult>>(new Map());
  const [report, setReport] = useState<{ title: string; ok: number; ko: number; lines: string[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  useEffect(() => { setSel({}); setResults(new Map()); setReport(null); setVerifiedAt(null); setReason(""); }, [city?.slug]);
  const sum = useMemo(() => summarizeWorkbench(rows), [rows]);
  const evFor = (r: WbRow) => r.kind === "material" ? evidence.filter((e) => e.material_slug === r.slug) : [];
  const selOf = (a: WbAction) => sel[a] ?? new Set<string>();
  const toggle = (a: WbAction, k: string) => setSel((s) => { const n = new Set(selOf(a)); n.has(k) ? n.delete(k) : n.add(k); return { ...s, [a]: n }; });
  const toggleAll = (a: WbAction) => setSel((s) => ({ ...s, [a]: selOf(a).size === rowsForAction(rows, a).length ? new Set() : new Set(rowsForAction(rows, a).map((r) => r.key)) }));

  // Ouverture ciblée : la section demandée est amenée à l'écran une fois les lignes chargées.
  useEffect(() => {
    if (!city || !focus || loadState !== "ok") return;
    const t = window.setTimeout(() => document.getElementById(`wb-${focus}`)?.scrollIntoView({ block: "start", behavior: "smooth" }), 150);
    return () => window.clearTimeout(t);
  }, [city, focus, loadState]);

  const verify = async () => { setBusy("verify"); try { await onVerify(); setVerifiedAt(new Date().toLocaleTimeString("fr-CA")); } finally { setBusy(null); } };

  const record = (title: string, chosen: WbRow[], r: Map<string, RowResult>) => {
    setResults((m) => { const n = new Map(m); r.forEach((v, k) => n.set(k, v)); return n; });
    const lines = chosen.map((c) => { const x = r.get(c.key); return `${x?.ok ? "✔" : "✖"} ${c.label} — ${x?.msg ?? "aucune réponse"}`; });
    setReport({ title, ok: chosen.filter((c) => r.get(c.key)?.ok).length, ko: chosen.filter((c) => !r.get(c.key)?.ok).length, lines });
  };

  const launch = async (a: RunAction) => {
    const fn = run[a]; if (!fn) return;
    const chosen = rowsForAction(rows, a).filter((r) => selOf(a).has(r.key));
    if (!chosen.length) return;
    const list = chosen.map((r) => `• ${r.label}${r.pageSlug ? ` (/${r.pageSlug})` : ""}`).join("\n");
    const cost = a === "generate" || a === "repair" ? `\nCoût IA estimé : ${estimateCredits(chosen.length)} crédit(s).` : "\nAucun appel IA.";
    const extraQ = a === "recheck" ? "\nActualise seulement le rapport de qualité : contenu, statut et noindex inchangés." : a === "autofix" ? "\nSauvegarde avant modification, corrections prises en charge seulement, puis recalcul. Aucune publication, noindex conservé." : "";
    const extra = extraQ || (a === "publish" ? "\nCes pages deviendront indexables (noindex de génération retiré; noindex volontaire jamais retiré). Le statut sera relu dans la base."
      : a === "generate" || a === "repair" ? "\nUniquement cette ville. Résultat : brouillon noindex, jamais publié automatiquement." : "");
    if (!window.confirm(`${ACTION_LABEL[a]} — ${chosen.length} page(s) de ${city?.name} :\n${list}${cost}${extra}\n\nConfirmer ?`)) return;
    setBusy(a);
    try {
      record(`${ACTION_LABEL[a]} — ${city?.name}`, chosen, await fn(chosen));
      setSel((s) => ({ ...s, [a]: new Set() }));
      await onVerify();
    } finally { setBusy(null); }
  };

  const decide = async (decision: Decision) => {
    if (!onDecideRows) return;
    const chosen = rowsForAction(rows, "decide").filter((r) => selOf("decide").has(r.key));
    if (!chosen.length || !validReason(reason)) return;
    if (!window.confirm(`${decision === "confirmee" ? "Confirmer" : "Exclure"} ${chosen.length} combinaison(s) pour ${city?.name} :\n${chosen.map((c) => "• " + c.label).join("\n")}\n\nMotif enregistré sur chaque combinaison : « ${reason.trim()} »\nUne décision par combinaison. Aucune génération ni publication ne sera lancée.`)) return;
    setBusy("decide");
    try {
      record(`Décision « ${decision === "confirmee" ? "confirmée" : "exclue"} » — ${city?.name}`, chosen, await onDecideRows(chosen, decision, reason.trim()));
      setSel((s) => ({ ...s, decide: new Set() }));
      await onVerify();
    } finally { setBusy(null); }
  };

  const order: WbAction[] = ["decide", "generate", "repair", "autofix", "recheck", "publish"];
  const sections = focus ? [focus, ...order.filter((a) => a !== focus)] : order;
  const blockedDrafts = rows.filter((r) => r.pageId && r.action !== "publish" && r.alt !== "publish");

  return (
    <Dialog open={!!city} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Gérer la ville — {city?.name}</DialogTitle></DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1" disabled={!!busy} onClick={() => void verify()}>
            {busy === "verify" ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Vérifier la ville
          </Button>
          {verifiedAt && <span className="text-[11px] text-muted-foreground">Vérifiée à {verifiedAt} (relecture de la base, aucune écriture)</span>}
        </div>

        {loadState !== "ok" ? (
          <div className="rounded-lg border border-border p-4 text-sm flex items-center gap-2">
            {loadState === "loading" ? <><Loader2 className="w-4 h-4 animate-spin" /> Lecture des combinaisons, pages et disponibilités de la ville…</>
              : <><AlertTriangle className="w-4 h-4 text-destructive" /> Lecture incomplète des données de la ville — aucune action proposée. Cliquez « Vérifier la ville » pour relire.</>}
          </div>
        ) : (<>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {[["Combinaisons", sum.total], ["Publiées", sum.published], ["Brouillons", sum.drafts], ["Sans page", sum.missing],
            ["Erreurs de génération", sum.genErrors], ["Brouillons à corriger", sum.qualityErrors], ["Disponibilité inconnue", sum.unknown], ["Exclues", sum.excluded]]
            .map(([l, v]) => <div key={l as string} className="rounded-md border border-border p-2"><div className="text-muted-foreground">{l}</div><div className="font-semibold text-base">{v}</div></div>)}
        </div>

        {report && (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-xs space-y-1" role="status">
            <div className="font-semibold text-sm">Résultat — {report.title} : {report.ok} réussite(s), {report.ko} refus/échec(s)</div>
            {report.lines.map((l) => <div key={l} className={l.startsWith("✔") ? "text-primary" : "text-destructive"}>{l}</div>)}
          </div>
        )}

        {sections.map((a) => {
          const list = rowsForAction(rows, a);
          const s = selOf(a);
          const title = a === "decide" ? "Décider la disponibilité" : a === "repair" ? "Régénérer les erreurs" : a === "publish" ? "Publier les non publiées" : ACTION_LABEL[a];
          return (
            <section key={a} id={`wb-${a}`} className={`rounded-lg border p-3 space-y-2 scroll-mt-4 ${focus === a ? "border-primary" : "border-border"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-sm">{title} ({list.length})</strong>
                {list.length > 0 && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => toggleAll(a)}>
                    {s.size === list.length ? "Tout désélectionner" : "Tout sélectionner"}
                  </Button>
                )}
                {a !== "decide" && list.length > 0 && (
                  <Button size="sm" className="h-7 text-xs ml-auto" disabled={!s.size || !!busy || !run[a as RunAction]} onClick={() => void launch(a as RunAction)}>
                    {busy === a ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}{ACTION_LABEL[a]} {s.size} page(s)
                  </Button>
                )}
              </div>
              {list.length === 0 && <p className="text-xs text-muted-foreground">{emptyReason(rows, a)}</p>}
              {a === "decide" && list.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-muted-foreground">Aucune preuve ni décision ne confirme ces combinaisons. Une information commerciale exacte est nécessaire : cochez, inscrivez le motif (5 caractères minimum, enregistré sur chaque combinaison), puis confirmez ou excluez. Aucune génération n'est lancée.</p>
                  <Input className="h-8 text-xs" placeholder="Motif de la décision (obligatoire)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Motif de la décision" />
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!s.size || !validReason(reason) || !!busy || !onDecideRows} onClick={() => void decide("confirmee")}>
                      {busy === "decide" && <Loader2 className="w-3 h-3 animate-spin mr-1" />}Confirmer la disponibilité ({s.size})
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!s.size || !validReason(reason) || !!busy || !onDecideRows} onClick={() => void decide("exclue")}>
                      Exclure ({s.size})
                    </Button>
                    {s.size > 0 && !validReason(reason) && <span className="text-[11px] text-destructive self-center">Motif obligatoire (5 caractères minimum).</span>}
                  </div>
                </div>
              )}
              {list.length > 0 && (
                <ul className="divide-y divide-border">
                  {list.map((r) => (
                    <li key={r.key} className="py-1.5 flex items-start gap-2 text-xs">
                      <Checkbox id={`${a}-${r.key}`} checked={s.has(r.key)} onCheckedChange={() => toggle(a, r.key)} className="mt-0.5" aria-label={`Sélectionner ${r.label}`} />
                      <label htmlFor={`${a}-${r.key}`} className="flex-1 min-w-0">
                        <span className="font-medium">{r.label}</span>
                        <span className="block text-muted-foreground">Disponibilité : {AVAIL_LABEL[r.availability]} · {pageLine(r)}</span>
                        {r.problems.length > 0 && <span className="block text-muted-foreground">{r.problems.join(" · ")}</span>}
                        {a === "repair" && <span className="block text-muted-foreground">Tentatives : {r.attempts} / 3</span>}
                        {(a === "recheck" || a === "autofix" || a === "publish") && r.pageId && <span className="block text-muted-foreground">Minimum 90 pour publier</span>}
                        {results.get(r.key) && <span className={`block ${results.get(r.key)!.ok ? "text-primary" : "text-destructive"}`}>{results.get(r.key)!.msg}</span>}
                      </label>
                      {results.get(r.key) && <Badge variant="outline" className={results.get(r.key)!.ok ? "text-primary" : "text-destructive"}>{results.get(r.key)!.ok ? "Réussi" : "Échec"}</Badge>}
                    </li>
                  ))}
                </ul>
              )}
              {a === "publish" && blockedDrafts.length > 0 && (
                <div className="text-[11px] space-y-0.5">
                  <div className="font-medium">Brouillons non admissibles ({blockedDrafts.length}) :</div>
                  {blockedDrafts.map((r) => <div key={r.key} className="text-muted-foreground">{r.label} /{r.pageSlug} — {[...r.problems, r.blocked].filter(Boolean).join(" · ") || "à revérifier"}</div>)}
                </div>
              )}
            </section>
          );
        })}

        <section className="rounded-lg border border-border p-3 space-y-1">
          <strong className="text-sm">Détail des {rows.length} combinaisons</strong>
          <ul className="divide-y divide-border">
            {rows.map((r) => {
              const res = results.get(r.key);
              return (
                <li key={r.key} className="py-1.5 text-xs space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{r.label}</span>
                    <Badge variant="outline" className="text-[10px]">{r.kind === "hub" ? "Page ville" : r.kind === "material" ? "Matériau" : "Service"}</Badge>
                    <Badge variant="outline" className="text-[10px]">{CAT_STATE_LABEL[r.state]}</Badge>
                    <Badge variant="outline" className="text-[10px]">Disponibilité : {AVAIL_LABEL[r.availability]}</Badge>
                    {r.action !== "none" && <Badge variant="outline" className="text-[10px]">Action possible : {ACTION_LABEL[r.action]}</Badge>}
                  </div>
                  <div className="text-muted-foreground">{pageLine(r)}</div>
                  {r.problems.length > 0 && <div className="text-muted-foreground">{r.problems.join(" · ")}</div>}
                  {r.blocked && <div className="text-muted-foreground">Bloquée : {r.blocked}</div>}
                  {evFor(r).length > 0 && (
                    <div className="text-muted-foreground">Preuves : {evFor(r).map((e) => {
                      const warn = e.evidence === "terre_seulement" || e.origin !== "/remblai";
                      return <span key={`${e.submission_number}-${e.material_slug}`} className={warn ? "text-destructive" : undefined}>
                        n° {e.submission_number ?? "?"} — {e.evidence === "directe" ? "demande explicite" : "« Terre » seulement (ne prouve pas le remblai)"}, {ORIGIN_LABEL[e.origin] ?? e.origin}{"; "}</span>;
                    })}</div>
                  )}
                  {res && <div className={res.ok ? "text-primary" : "text-destructive"}>{res.ok ? "✔" : "✖"} {res.msg}</div>}
                </li>
              );
            })}
          </ul>
        </section>
        </>)}
      </DialogContent>
    </Dialog>
  );
}
