// Catalogue commun côté entrepreneur : ses éléments restent privés; il peut les proposer
// (accord Super Admin requis) et ajouter à son entreprise une copie d'un élément approuvé.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import * as P from "@/lib/finances/purchases";
import * as api from "@/lib/finances/api";
import { listCatalog, propose, adopt, KIND_LABEL, type CatalogItem } from "@/lib/catalog";

const STATUS: Record<string, string> = { proposed: "En attente du Super Admin", approved: "Partagé", rejected: "Refusé" };

export default function SharedCatalogPanel({ companyId, canWrite, onChanged }: { companyId: string; canWrite: boolean; onChanged?: () => void }) {
  const { toast } = useToast();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [sups, setSups] = useState<{ id: string; name: string }[]>([]);
  const [cats, setCats] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [i, s, c] = await Promise.all([listCatalog(), P.suppliers(companyId), api.categories(companyId)]);
    setItems(i); setSups(s.filter((x) => !x.archived)); setCats(c.filter((x) => !x.archived_at));
  }, [companyId]);
  useEffect(() => { load().catch(() => {}); }, [load]);

  const norm = (s: string) => s.trim().toLowerCase();
  const mine = (kind: string, name: string) => items.find((i) => i.kind === kind && norm(i.name) === norm(name) && i.status !== "rejected");
  const owned = (i: CatalogItem) => (i.kind === "supplier" ? sups : cats).some((x) => norm(x.name) === norm(i.name));

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try { await fn(); toast({ title: ok }); await load(); onChanged?.(); }
    catch (e) { toast({ title: "Action impossible", description: (e as Error).message, variant: "destructive" }); }
    finally { setBusy(null); }
  };

  const shared = items.filter((i) => i.status === "approved" && i.kind !== "unit_category");
  const Row = ({ kind, id, name }: { kind: "supplier" | "expense_category"; id: string; name: string }) => {
    const p = mine(kind, name);
    return <li className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <span className="truncate">{name}</span>
      {p ? <span className="text-xs text-muted-foreground shrink-0">{STATUS[p.status]}</span>
        : canWrite && <Button size="sm" variant="outline" disabled={busy === id} onClick={() => run(id, () => propose(kind, companyId, id), "Proposé au Super Admin")}>Proposer à tous</Button>}
    </li>;
  };

  return <div className="space-y-4">
    <p className="text-xs text-muted-foreground">Vos fournisseurs et catégories restent privés à votre entreprise. « Proposer à tous » les envoie au Super Admin; une fois approuvés, les autres entrepreneurs peuvent en ajouter une copie. Seuls le nom, le téléphone général et la ville sont partagés — jamais vos numéros de compte, notes, factures ou soldes.</p>
    <section className="rounded-lg border p-3">
      <h3 className="text-sm font-semibold mb-1">Catalogue commun approuvé</h3>
      {shared.length === 0 ? <p className="text-xs text-muted-foreground">Aucun élément partagé pour l'instant.</p> :
        <ul className="divide-y">{shared.map((i) => <li key={i.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
          <span className="truncate">{i.name} <span className="text-xs text-muted-foreground">· {KIND_LABEL[i.kind]}{i.payload?.city ? ` · ${i.payload.city}` : ""}</span></span>
          {owned(i) ? <span className="text-xs text-muted-foreground shrink-0">Déjà dans mon entreprise</span>
            : canWrite && <Button size="sm" disabled={busy === i.id} onClick={() => run(i.id, () => adopt(i.id, companyId), "Ajouté à votre entreprise")}>Ajouter</Button>}
        </li>)}</ul>}
    </section>
    <section className="rounded-lg border p-3">
      <h3 className="text-sm font-semibold mb-1">Mes fournisseurs</h3>
      {sups.length === 0 ? <p className="text-xs text-muted-foreground">Aucun fournisseur.</p> : <ul className="divide-y">{sups.map((s) => <Row key={s.id} kind="supplier" id={s.id} name={s.name} />)}</ul>}
    </section>
    <section className="rounded-lg border p-3">
      <h3 className="text-sm font-semibold mb-1">Mes catégories de dépenses</h3>
      {cats.length === 0 ? <p className="text-xs text-muted-foreground">Aucune catégorie.</p> : <ul className="divide-y">{cats.map((c) => <Row key={c.id} kind="expense_category" id={c.id} name={c.name} />)}</ul>}
    </section>
  </div>;
}
