import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CAT_STATE_LABEL, estimateCredits } from "@/lib/seo/catalogStatus";
import { ACTION_LABEL, summarizeWorkbench, type WbAction, type WbRow } from "@/lib/seo/cityWorkbench";

export type RowResult = { ok: boolean; msg: string };
type Runner = (rows: WbRow[]) => Promise<Map<string, RowResult>>;

// Poste de travail d'une ville : vérification détaillée, sélection, actions manuelles et résultat par page.
// Rien n'est lancé sans clic + confirmation; chaque action ne vise que les lignes admissibles cochées.
export type Evidence = { submission_number: string | null; material_slug: string; evidence: string; origin: string; materials: string[] | null };
const ORIGIN_LABEL: Record<string, string> = { "/remblai": "formulaire remblai (besoin de remplissage)", "/depot-materiaux": "dépôt de matériaux (terre à SORTIR)", non_indiquee: "origine non indiquée" };

export default function CityWorkbenchDialog({ city, rows, onClose, onVerify, onDecide, run, evidence = [] }: {
  city: { slug: string; name: string } | null; rows: WbRow[]; evidence?: Evidence[];
  onClose: () => void; onVerify: () => Promise<void>; onDecide: () => void;
  run: Partial<Record<Exclude<WbAction, "none" | "decide">, Runner>>;
}) {
  const [sel, setSel] = useState<Record<string, Set<string>>>({});
  const [results, setResults] = useState<Map<string, RowResult>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  useEffect(() => { setSel({}); setResults(new Map()); setVerifiedAt(null); }, [city?.slug]);
  const sum = useMemo(() => summarizeWorkbench(rows), [rows]);
  // Outils de qualité offerts pour TOUS les brouillons (jamais pour les pages en ligne).
  const rowsFor = (a: WbAction) => rows.filter((r) => r.action === a || r.alt === a || ((a === "recheck" || a === "autofix") && !!r.pageId));
  const evFor = (r: WbRow) => r.kind === "material" ? evidence.filter((e) => e.material_slug === r.slug) : [];
  const selOf = (a: WbAction) => sel[a] ?? new Set<string>();
  const toggle = (a: WbAction, k: string) => setSel((s) => { const n = new Set(selOf(a)); n.has(k) ? n.delete(k) : n.add(k); return { ...s, [a]: n }; });
  const toggleAll = (a: WbAction) => setSel((s) => ({ ...s, [a]: selOf(a).size === rowsFor(a).length ? new Set() : new Set(rowsFor(a).map((r) => r.key)) }));

  const verify = async () => { setBusy("verify"); try { await onVerify(); setVerifiedAt(new Date().toLocaleTimeString("fr-CA")); } finally { setBusy(null); } };

  const launch = async (a: Exclude<WbAction, "none" | "decide">) => {
    const fn = run[a]; if (!fn) return;
    const chosen = rowsFor(a).filter((r) => selOf(a).has(r.key));
    if (!chosen.length) return;
    const list = chosen.map((r) => `• ${r.label}${r.pageSlug ? ` (/${r.pageSlug})` : ""}`).join("\n");
    const cost = a === "generate" || a === "repair" ? `\nCoût IA estimé : ${estimateCredits(chosen.length)} crédit(s).` : "\nAucun appel IA.";
    const extraQ = a === "recheck" ? "\nActualise seulement le rapport de qualité : contenu, statut et noindex inchangés." : a === "autofix" ? "\nSauvegarde avant modification, corrections prises en charge seulement, puis recalcul. Aucune publication, noindex conservé." : "";
    const extra = extraQ || (a === "publish" ? "\nCes pages deviendront indexables (noindex de génération retiré; noindex volontaire jamais retiré). Le statut sera relu dans la base." : "");
    if (!window.confirm(`${ACTION_LABEL[a]} — ${chosen.length} page(s) de ${city?.name} :\n${list}${cost}${extra}\n\nConfirmer ?`)) return;
    setBusy(a);
    try {
      const r = await fn(chosen);
      setResults((m) => { const n = new Map(m); r.forEach((v, k) => n.set(k, v)); return n; });
      setSel((s) => ({ ...s, [a]: new Set() }));
      await onVerify();
    } finally { setBusy(null); }
  };

  const groups: Array<Exclude<WbAction, "none" | "decide">> = ["generate", "repair", "recheck", "autofix", "publish"];

  return (
    <Dialog open={!!city} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Gérer la ville — {city?.name}</DialogTitle></DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1" disabled={!!busy} onClick={() => void verify()}>
            {busy === "verify" ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Vérifier la ville
          </Button>
          {verifiedAt && <span className="text-[11px] text-muted-foreground">Vérifiée à {verifiedAt} (relecture de la base, aucune écriture)</span>}
          {sum.unknown > 0 && <Button size="sm" variant="outline" onClick={onDecide}>Décider la disponibilité ({sum.unknown})</Button>}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {[["Combinaisons", sum.total], ["Publiées", sum.published], ["Brouillons", sum.drafts], ["Manquantes", sum.missing],
            ["Erreurs de génération", sum.genErrors], ["Erreurs de qualité", sum.qualityErrors], ["Disponibilité inconnue", sum.unknown], ["Exclues", sum.excluded]]
            .map(([l, v]) => <div key={l as string} className="rounded-md border border-border p-2"><div className="text-muted-foreground">{l}</div><div className="font-semibold text-base">{v}</div></div>)}
        </div>

        {groups.map((a) => {
          const list = rowsFor(a);
          if (!list.length) return null;
          const s = selOf(a);
          return (
            <section key={a} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-sm">{ACTION_LABEL[a]} ({list.length})</strong>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => toggleAll(a)}>
                  {s.size === list.length ? "Tout désélectionner" : "Tout sélectionner"}
                </Button>
                <Button size="sm" className="h-7 text-xs ml-auto" disabled={!s.size || !!busy || !run[a]} onClick={() => void launch(a)}>
                  {busy === a ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}{ACTION_LABEL[a]} {s.size} page(s)
                </Button>
              </div>
              <ul className="divide-y divide-border">
                {list.map((r) => (
                  <li key={r.key} className="py-1.5 flex items-start gap-2 text-xs">
                    <Checkbox id={`${a}-${r.key}`} checked={s.has(r.key)} onCheckedChange={() => toggle(a, r.key)} className="mt-0.5" />
                    <label htmlFor={`${a}-${r.key}`} className="flex-1 min-w-0">
                      <span className="font-medium">{r.label}</span>{r.pageSlug && <span className="font-mono text-muted-foreground"> /{r.pageSlug}</span>}
                      {r.problems.length > 0 && <span className="block text-muted-foreground">{r.problems.join(" · ")}</span>}
                      {a === "repair" && <span className="block text-muted-foreground">Tentatives : {r.attempts} / 3</span>}
                      {(a === "recheck" || a === "autofix" || a === "publish") && r.pageId && <span className="block text-muted-foreground">Note actuelle : {r.qaScore ?? "absente"}{r.qaScore != null && !r.qaFresh ? " (périmée)" : ""} — minimum 90 pour publier</span>}
                      {results.get(r.key) && <span className={`block ${results.get(r.key)!.ok ? "text-primary" : "text-destructive"}`}>{results.get(r.key)!.msg}</span>}
                    </label>
                    {results.get(r.key) && <Badge variant="outline" className={results.get(r.key)!.ok ? "text-primary" : "text-destructive"}>{results.get(r.key)!.ok ? "Réussi" : "Échec"}</Badge>}
                  </li>
                ))}
              </ul>
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
                    <Badge variant="outline" className="text-[10px]">{CAT_STATE_LABEL[r.state]}</Badge>
                    <Badge variant="outline" className="text-[10px]">Disponibilité : {r.availability}</Badge>
                    {r.action !== "none" && <Badge variant="outline" className="text-[10px]">Prochaine action : {ACTION_LABEL[r.action]}</Badge>}
                  </div>
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
      </DialogContent>
    </Dialog>
  );
}
