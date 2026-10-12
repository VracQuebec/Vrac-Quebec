import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { saveDecision, saveDecisions, expandBulk, validReason, type Decision } from "@/lib/seo/slotDecisions";

// Décision admin, une combinaison à la fois, motif obligatoire.
// Une décision ne déclenche JAMAIS de génération : elle change seulement la disponibilité affichée.
export type UnknownItem = { kind: "material" | "service"; slug: string; label: string };

export default function UnknownDecisionDialog({ city, items, onClose, onSaved }: {
  city: { slug: string; name: string } | null; items: UnknownItem[]; onClose: () => void; onSaved: () => void;
}) {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkReason, setBulkReason] = useState("");
  const keyOf = (it: UnknownItem) => `${it.kind}|${it.slug}`;
  const togglePick = (k: string) => setPicked((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });
  // Lot : une décision PAR combinaison cochée (même motif recopié), aucune génération.
  const decideBulk = async (decision: Decision) => {
    if (!city) return;
    const chosen = items.filter((it) => picked.has(keyOf(it)));
    if (!chosen.length) return;
    if (!validReason(bulkReason)) { toast({ title: "Motif obligatoire", description: "5 caractères minimum.", variant: "destructive" }); return; }
    if (!window.confirm(`${decision === "confirmee" ? "Confirmer" : "Exclure"} ${chosen.length} combinaison(s) pour ${city.name} :\n${chosen.map((c) => "• " + c.label).join("\n")}\n\nUne décision par combinaison. Aucune génération ni publication ne sera lancée.`)) return;
    setBusy("bulk");
    try {
      const rows = [
        ...expandBulk([{ city_slug: city.slug, kind: "material", slugs: chosen.filter((c) => c.kind === "material").map((c) => c.slug), decision, reason: bulkReason }]),
        ...expandBulk([{ city_slug: city.slug, kind: "service", slugs: chosen.filter((c) => c.kind === "service").map((c) => c.slug), decision, reason: bulkReason }]),
      ];
      const o = await saveDecisions(rows);
      toast({ title: `${o.ok.length} décision(s) enregistrée(s)`, description: o.failed.length ? `Échecs : ${o.failed.map((f) => `${f.slug} (${f.error})`).join(", ")}` : "Aucune génération lancée.", variant: o.failed.length ? "destructive" : undefined });
      setPicked(new Set()); onSaved();
    } finally { setBusy(null); }
  };
  const decide = async (it: UnknownItem, decision: Decision) => {
    if (!city) return;
    const k = `${it.kind}|${it.slug}`;
    const reason = reasons[k] ?? "";
    if (!validReason(reason)) { toast({ title: "Motif obligatoire", description: "5 caractères minimum.", variant: "destructive" }); return; }
    setBusy(k);
    try {
      await saveDecision({ city_slug: city.slug, kind: it.kind, slug: it.slug, decision, reason });
      toast({ title: decision === "confirmee" ? "Disponibilité confirmée" : "Combinaison exclue", description: `${it.label} — ${city.name}. Aucune génération lancée.` });
      onSaved();
    } catch (e) {
      toast({ title: "Décision non enregistrée", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally { setBusy(null); }
  };
  return (
    <Dialog open={!!city} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Disponibilité inconnue — {city?.name}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          Aucune demande ni service configuré ne prouve ces combinaisons. Décidez une par une, avec un motif.
          Une décision ne lance jamais de génération.
        </p>
        {items.length > 0 && (
          <div className="rounded-md border border-border p-2 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Décision en lot ({picked.size} cochée(s))</span>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPicked(picked.size === items.length ? new Set() : new Set(items.map(keyOf)))}>
                {picked.size === items.length ? "Tout désélectionner" : "Tout sélectionner"}
              </Button>
            </div>
            <Input className="h-8 text-xs" placeholder="Motif commun (obligatoire, recopié sur chaque décision)" value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} />
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!picked.size || busy === "bulk"} onClick={() => void decideBulk("confirmee")}>Confirmer la sélection</Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!picked.size || busy === "bulk"} onClick={() => void decideBulk("exclue")}>Exclure la sélection</Button>
            </div>
          </div>
        )}
        <ul className="divide-y divide-border text-sm">
          {items.map((it) => {
            const k = `${it.kind}|${it.slug}`;
            return (
              <li key={k} className="py-2 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={picked.has(k)} onChange={() => togglePick(k)} aria-label={`Sélectionner ${it.label}`} />{it.label}</label>
                  <Badge variant="outline" className="text-[10px]">{it.kind === "material" ? "Matériau" : "Service"}</Badge>
                </div>
                <Input className="h-8 text-xs" placeholder="Motif (obligatoire)" value={reasons[k] ?? ""}
                  onChange={(e) => setReasons((r) => ({ ...r, [k]: e.target.value }))} />
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy === k} onClick={() => void decide(it, "confirmee")}>Confirmer</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy === k} onClick={() => void decide(it, "exclue")}>Exclure</Button>
                </div>
              </li>
            );
          })}
          {items.length === 0 && <li className="py-2 text-muted-foreground">Aucune combinaison inconnue.</li>}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
