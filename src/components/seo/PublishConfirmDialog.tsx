import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { PublishPrecheck } from "@/lib/seo/cityPublish";

// Publication confirmée page par page : chaque brouillon admissible est listé et doit être coché.
// Seules les pages cochées sont publiées; leur noindex de génération est retiré, jamais un noindex volontaire.
export default function PublishConfirmDialog({ city, pre, onClose, onConfirm }: {
  city: { slug: string; name: string } | null; pre: PublishPrecheck | undefined;
  onClose: () => void; onConfirm: (slugs: string[]) => void;
}) {
  const [sel, setSel] = useState<string[]>([]);
  useEffect(() => setSel([]), [city?.slug]);
  const toggle = (s: string) => setSel((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]));
  return (
    <Dialog open={!!city} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Publier — {city?.name}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          Cochez les pages à publier (ou « Tout sélectionner »). Elle deviendra indexable (retrait du noindex de génération). Le statut est relu dans la base après publication.
        </p>
        {!!pre?.eligible.length && (
          <Button variant="ghost" size="sm" className="h-7 text-xs self-start"
            onClick={() => setSel(sel.length === pre.eligible.length ? [] : [...pre.eligible])}>
            {sel.length === pre.eligible.length ? "Tout désélectionner" : `Tout sélectionner (${pre.eligible.length})`}
          </Button>
        )}
        <ul className="divide-y divide-border text-sm">
          {pre?.eligible.map((s) => (
            <li key={s} className="flex items-center gap-2 py-1.5">
              <Checkbox id={`pub-${s}`} checked={sel.includes(s)} onCheckedChange={() => toggle(s)} />
              <label htmlFor={`pub-${s}`} className="font-mono text-xs">/{s}</label>
            </li>
          ))}
        </ul>
        {!!pre?.blocked.length && (
          <div className="text-[11px] text-muted-foreground space-y-0.5">
            {pre.blocked.map((b) => <div key={b.slug}>Non publiable /{b.slug} : {b.reasons.join(" ")}</div>)}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Annuler</Button>
          <Button size="sm" disabled={sel.length === 0}
            onClick={() => window.confirm(`Publier et rendre indexable(s) ${sel.length} page(s) :\n${sel.map((s) => "/" + s).join("\n")}`) && onConfirm(sel)}>
            Publier {sel.length} page(s)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
