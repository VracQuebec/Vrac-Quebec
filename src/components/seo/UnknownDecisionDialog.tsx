import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { saveDecision, validReason, type Decision } from "@/lib/seo/slotDecisions";

// Décision admin, une combinaison à la fois, motif obligatoire.
// Une décision ne déclenche JAMAIS de génération : elle change seulement la disponibilité affichée.
export type UnknownItem = { kind: "material" | "service"; slug: string; label: string };

export default function UnknownDecisionDialog({ city, items, onClose, onSaved }: {
  city: { slug: string; name: string } | null; items: UnknownItem[]; onClose: () => void; onSaved: () => void;
}) {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
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
        <ul className="divide-y divide-border text-sm">
          {items.map((it) => {
            const k = `${it.kind}|${it.slug}`;
            return (
              <li key={k} className="py-2 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span>{it.label}</span>
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
