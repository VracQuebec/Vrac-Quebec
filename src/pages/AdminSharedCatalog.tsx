// Super Admin : approuver (nom corrigé possible) ou refuser avec motif les propositions au catalogue commun.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { listCatalog, decide, KIND_LABEL, type CatalogItem } from "@/lib/catalog";

export default function AdminSharedCatalog() {
  const { toast } = useToast();
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const load = useCallback(() => listCatalog().then(setItems).catch(() => setItems([])), []);
  useEffect(() => { load(); }, [load]);

  const act = async (i: CatalogItem, ok: boolean) => {
    try { await decide(i.id, ok, names[i.id], reasons[i.id]); toast({ title: ok ? "Approuvé — disponible pour tous" : "Refusé" }); load(); }
    catch (e) { toast({ title: "Action impossible", description: (e as Error).message, variant: "destructive" }); }
  };
  const pending = (items ?? []).filter((i) => i.status === "proposed");
  const done = (items ?? []).filter((i) => i.status !== "proposed");

  return <main className="mx-auto max-w-3xl p-4 space-y-4">
    <h1 className="text-xl font-bold">Catalogue commun — propositions</h1>
    <p className="text-sm text-muted-foreground">Fournisseurs, catégories de dépenses et équipements créés par les entrepreneurs. Ils restent privés à leur entreprise tant que vous ne les approuvez pas.</p>
    {items === null ? <p className="text-sm">Chargement…</p> : pending.length === 0 ? <p className="text-sm text-muted-foreground">Aucune proposition en attente.</p> :
      pending.map((i) => <div key={i.id} className="rounded-lg border p-3 space-y-2">
        <div className="text-xs text-muted-foreground">{KIND_LABEL[i.kind]}{i.payload?.city ? ` · ${i.payload.city}` : ""}{i.payload?.phone ? ` · ${i.payload.phone}` : ""}</div>
        <Input aria-label="Nom" defaultValue={i.name} onChange={(e) => setNames((n) => ({ ...n, [i.id]: e.target.value }))} />
        <Input aria-label="Motif du refus" placeholder="Motif (obligatoire pour refuser)" onChange={(e) => setReasons((r) => ({ ...r, [i.id]: e.target.value }))} />
        <div className="flex gap-2"><Button size="sm" onClick={() => act(i, true)}>Approuver pour tous</Button><Button size="sm" variant="outline" onClick={() => act(i, false)}>Refuser</Button></div>
      </div>)}
    {done.length > 0 && <section><h2 className="text-sm font-semibold mb-1">Historique</h2><ul className="divide-y text-sm">{done.map((i) => <li key={i.id} className="py-1.5 flex justify-between gap-2"><span>{i.name} · {KIND_LABEL[i.kind]}</span><span className="text-xs text-muted-foreground">{i.status === "approved" ? "Approuvé" : `Refusé${i.reason ? ` : ${i.reason}` : ""}`}</span></li>)}</ul></section>}
  </main>;
}
