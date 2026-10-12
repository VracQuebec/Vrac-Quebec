import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

// Écran de décision des combinaisons à disponibilité inconnue (ville × matériau/service).
// Lecture seule tant que la table de décisions par ville n'est pas approuvée :
// une décision ne déclenche JAMAIS de génération; elle alimente seulement la file.
export type UnknownItem = { kind: "material" | "service"; slug: string; label: string };

export default function UnknownDecisionDialog({ city, items, onClose }: {
  city: { slug: string; name: string } | null; items: UnknownItem[]; onClose: () => void;
}) {
  return (
    <Dialog open={!!city} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Disponibilité inconnue — {city?.name}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          Aucune demande ni aucun service configuré ne prouve que ces combinaisons sont pertinentes pour cette ville.
          Elles ne sont jamais générées automatiquement. Une confirmation les ajoutera seulement à la file du Générateur,
          sans lancer de génération; une exclusion les retirera du calcul de couverture.
        </p>
        <div className="rounded-md border border-border bg-muted/40 p-2 text-xs">
          Décisions en attente d'approbation : l'enregistrement par ville nécessite une nouvelle table (non encore appliquée).
          Cette liste est affichée en lecture seule.
        </div>
        <ul className="divide-y divide-border text-sm">
          {items.map((it) => (
            <li key={`${it.kind}|${it.slug}`} className="flex items-center justify-between py-1.5 gap-2">
              <span>{it.label}</span>
              <Badge variant="outline" className="text-[10px]">{it.kind === "material" ? "Matériau" : "Service"}</Badge>
            </li>
          ))}
          {items.length === 0 && <li className="py-2 text-muted-foreground">Aucune combinaison inconnue.</li>}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
