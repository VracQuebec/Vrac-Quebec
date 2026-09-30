// Catalogue privé de prestations et tarifs, et modèles de soumission par métier.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useDraft } from "@/lib/drafts/useDraft";
import DraftStatusBar from "@/components/drafts/DraftStatusBar";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { TRADES } from "@/lib/entcrm/api";
import { UNITS, unitLabel, ensureTemplates, type QLine } from "@/lib/entcrm/catalog";

const db = supabase as any;
const sel = "h-10 rounded-md border border-border bg-background px-2 text-sm";
const money = (n?: number | null) => n == null ? "À renseigner" : Number(n).toLocaleString("fr-CA", { style: "currency", currency: "CAD" });

export default function CrmServices({ companyId, canWrite, canAdmin, canCost }: { companyId: string; canWrite: boolean; canAdmin: boolean; canCost: boolean }) {
  const [rows, setRows] = useState<any[]>([]); const [costs, setCosts] = useState<Record<string, number | null>>({});
  const [mats, setMats] = useState<any[]>([]);
  const [tpls, setTpls] = useState<any[]>([]);
  // Fenêtres et filtre dans l'adresse (?svc=, ?tpl=, ?sa=1) : conservés après Retour et actualisation.
  const [sp, setSp] = useSearchParams(); const archived = sp.get("sa") === "1";
  const setP = (k: string, v: string | null, replace = false) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, replace ? { replace: true } : undefined); };
  const setArchived = (b: boolean) => setP("sa", b ? "1" : null, true);
  const svcId = sp.get("svc"), tplId = sp.get("tpl");
  const found = rows.find((r) => r.id === svcId);
  const open = svcId === "nouveau" ? { unit: "heure", trades: [] } : found ? { ...found, internal_cost: canCost ? (costs[found.id] ?? "") : undefined } : null;
  const tpl = tplId === "nouveau" ? { trade: "autre", name: "", lines: [], inclusions: "", exclusions: "", conditions: "" } : tpls.find((t) => t.id === tplId) ?? null;
  const setOpen = (v: any) => setP("svc", v ? v.id ?? "nouveau" : null);
  const setTpl = (v: any) => setP("tpl", v ? v.id ?? "nouveau" : null);
  const load = useCallback(async () => {
    const q = db.from("ent_crm_services").select("*").eq("company_id", companyId).order("label");
    setRows((await (archived ? q.not("archived_at", "is", null) : q.is("archived_at", null))).data ?? []);
    if (canCost) { const { data } = await db.from("ent_crm_service_costs").select("service_id,internal_cost").eq("company_id", companyId); setCosts(Object.fromEntries((data ?? []).map((c: any) => [c.service_id, c.internal_cost]))); }
    if (canWrite) await ensureTemplates(companyId);
    setTpls((await db.from("ent_crm_templates").select("*").eq("company_id", companyId).is("archived_at", null).order("name")).data ?? []);
  }, [companyId, archived, canCost, canWrite]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { db.from("material_catalog").select("id,name:name_fr").eq("is_active", true).order("name_fr").limit(500).then(({ data }: any) => setMats(data ?? [])); }, []);

  return <div className="space-y-6">
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="font-display text-lg font-bold">Prestations et tarifs privés</h2>
        {canWrite && <Button size="sm" onClick={() => setOpen({ unit: "heure", trades: [] })}><Plus className="mr-1 h-4 w-4" />Nouvelle prestation</Button>}
        <label className="ml-auto flex items-center gap-1 text-xs"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />Archivées</label>
      </div>
      <p className="mb-2 text-xs text-muted-foreground">Visibles seulement par votre entreprise. Un prix vide reste « À renseigner ». Aucune conversion voyage ↔ tonne n'est faite automatiquement.</p>
      {!rows.length && <p className="text-sm text-muted-foreground">Aucune prestation.</p>}
      <div className="grid gap-2 md:grid-cols-2">{rows.map((s) => <div key={s.id} className="rounded-lg border border-border bg-card p-3 text-sm">
        <p className="font-display font-bold">{s.label} {s.is_demo && <span className="rounded bg-muted px-1 text-xs">fictif</span>}</p>
        <p>{money(s.price)} / {unitLabel(s.unit)}{s.valid_until && ` · valide jusqu'au ${s.valid_until}`}</p>
        {canCost && costs[s.id] != null && <p className="text-xs text-muted-foreground">Coût interne : {money(costs[s.id])}{s.price != null && ` · marge ${money(s.price - (costs[s.id] as number))}`}</p>}
        {s.trades?.length > 0 && <p className="text-xs text-muted-foreground">{s.trades.map((t: string) => TRADES[t]?.l ?? t).join(", ")}</p>}
        {canWrite && <div className="mt-2 flex gap-1"><Button size="sm" variant="outline" onClick={() => setOpen({ ...s, internal_cost: canCost ? (costs[s.id] ?? "") : undefined })}>Modifier</Button>
          <Button size="sm" variant="ghost" onClick={async () => { await db.from("ent_crm_services").update({ archived_at: s.archived_at ? null : new Date().toISOString() }).eq("id", s.id); load(); }}>{s.archived_at ? "Réactiver" : "Archiver"}</Button></div>}
      </div>)}</div>
    </section>

    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2"><h2 className="font-display text-lg font-bold">Modèles de soumission par métier</h2>
        {canWrite && <Button size="sm" variant="outline" onClick={() => setTpl({ trade: "autre", name: "", lines: [], inclusions: "", exclusions: "", conditions: "" })}><Plus className="mr-1 h-4 w-4" />Nouveau modèle</Button>}</div>
      <div className="grid gap-2 md:grid-cols-2">{tpls.map((t) => <div key={t.id} className="rounded-lg border border-border bg-card p-3 text-sm">
        <p className="font-display font-bold">{t.name}</p><p className="text-xs text-muted-foreground">{TRADES[t.trade]?.l ?? t.trade} · {(t.lines ?? []).length} ligne(s) à compléter</p>
        {canWrite && <div className="mt-2 flex gap-1"><Button size="sm" variant="outline" onClick={() => setTpl(t)}>Modifier</Button>{canAdmin && <Button size="sm" variant="ghost" onClick={async () => { await db.from("ent_crm_templates").update({ archived_at: new Date().toISOString() }).eq("id", t.id); load(); }}>Archiver</Button>}</div>}
      </div>)}</div>
    </section>

    {open && <ServiceDialog key={svcId} initial={open} companyId={companyId} canCost={canCost} mats={mats} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} />}
    {tpl && <TplDialog key={tplId} initial={tpl} companyId={companyId} onClose={() => setTpl(null)} onSaved={() => { setTpl(null); load(); }} />}
  </div>;
}

function ServiceDialog({ initial, companyId, canCost, mats, onClose, onSaved }: any) {
  const { user: me } = useAuthReady(); const [open, setOpen] = useState<any>(initial); const [stale, setStale] = useState<any>(null); const busy = useRef(false);
  const init = useMemo(() => JSON.stringify(initial), []); // eslint-disable-line react-hooks/exhaustive-deps
  const store = useDraft({
    id: me ? { module: "crm", form: "tarif", owner: me.id, company: companyId, recordId: initial.id ?? null } : null,
    data: { v: open, base: initial.updated_at ?? null },
    label: (d) => `CRM — Prestation ${d.v.label ? `« ${d.v.label} »` : "(nouveau)"}`,
    route: `/entrepreneur/crm?company=${companyId}&tab=services&svc=${initial.id ?? "nouveau"}`,
    isEmpty: (d) => JSON.stringify(d.v) === init,
    onRestore: (d) => { if (initial.id && d.base && initial.updated_at && d.base !== initial.updated_at) setStale(d.v); else setOpen((x: any) => ({ ...x, ...d.v })); },
  });
  const save = async () => { if (busy.current) return; busy.current = true; try {
    const price = open.price === "" || open.price == null ? null : Number(open.price);
    if (price != null && (!Number.isFinite(price) || price < 0)) return toast({ title: "Prix invalide", description: "Saisissez un montant positif, ou laissez vide (À renseigner).", variant: "destructive" });
    if (price === 0 && !open.price_zero_confirmed) return toast({ title: "Prix à zéro", description: "Cochez « Zéro volontaire » ou laissez le prix vide (À renseigner)." });
    const row = { company_id: companyId, label: open.label, description: open.description || null, trades: open.trades ?? [], unit: open.unit ?? "heure", price, price_zero_confirmed: price === 0, inclusions: open.inclusions || null, exclusions: open.exclusions || null, valid_until: open.valid_until || null, material_id: open.material_id || null, equipment_ref: open.equipment_ref || null, private_notes: open.private_notes || null, is_demo: !!open.is_demo, updated_at: new Date().toISOString() };
    if (!row.label) return toast({ title: "Libellé requis" });
    const r = open.id ? await db.from("ent_crm_services").update(row).eq("id", open.id).select("id").single() : await db.from("ent_crm_services").insert(row).select("id").single();
    if (r.error) return toast({ title: "Refusé — votre saisie est conservée", description: r.error.message, variant: "destructive" });
    if (canCost && open.internal_cost !== undefined) {
      const c = await db.from("ent_crm_service_costs").upsert({ service_id: r.data.id, company_id: companyId, internal_cost: open.internal_cost === "" ? null : Number(open.internal_cost), updated_at: new Date().toISOString() });
      if (c.error) toast({ title: "Coût interne refusé", description: c.error.message });
    }
    store.finalize(); onSaved();
  } finally { busy.current = false; } };
  return <Dialog open onOpenChange={onClose}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Prestation</DialogTitle></DialogHeader>
      <DraftStatusBar status={store.status} savedAt={store.savedAt} restored={!!store.restoredMeta} onDiscard={() => { store.discard(); setOpen(initial); setStale(null); }} discardConfirm="Abandonner la préparation de prestation ? Les saisies non enregistrées seront effacées; rien d'enregistré n'est modifié." sync={store.sync} synced={store.synced} conflict={store.conflict} onUseServer={store.useServerVersion} onKeepLocal={store.keepLocalVersion} onRestartAsNew={store.restartAsNew} restartError={store.restartError} onRetry={store.retrySave} />
      {stale && <div role="alert" className="rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-xs">Cette fiche a été modifiée ailleurs depuis votre préparation. L'état actuel est affiché; votre saisie est conservée à part.<div className="mt-1 flex gap-2"><Button size="sm" variant="outline" onClick={() => { setOpen((x: any) => ({ ...x, ...stale })); setStale(null); }}>Appliquer ma saisie préparée</Button><Button size="sm" variant="ghost" onClick={() => setStale(null)}>Garder l'état actuel</Button></div></div>}
      <Input placeholder="Libellé (ex. Camion 12 roues à l'heure)" value={open.label ?? ""} onChange={(e) => setOpen({ ...open, label: e.target.value })} />
      <Textarea placeholder="Description" value={open.description ?? ""} onChange={(e) => setOpen({ ...open, description: e.target.value })} />
      <div className="flex flex-wrap gap-2 text-xs">{Object.entries(TRADES).map(([k, t]) => <label key={k} className="flex items-center gap-1"><input type="checkbox" checked={(open.trades ?? []).includes(k)} onChange={(e) => setOpen({ ...open, trades: e.target.checked ? [...(open.trades ?? []), k] : open.trades.filter((x: string) => x !== k) })} />{t.l}</label>)}</div>
      <div className="grid grid-cols-2 gap-2">
        <select aria-label="Unité" className={sel} value={open.unit} onChange={(e) => setOpen({ ...open, unit: e.target.value })}>{UNITS.map((u) => <option key={u.v} value={u.v}>{u.l}</option>)}</select>
        <Input type="number" min={0} step="0.01" placeholder="Prix de vente (vide = À renseigner)" value={open.price ?? ""} onChange={(e) => setOpen({ ...open, price: e.target.value })} />
      </div>
      {Number(open.price) === 0 && open.price !== "" && open.price != null && <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!!open.price_zero_confirmed} onChange={(e) => setOpen({ ...open, price_zero_confirmed: e.target.checked })} />Zéro volontaire (prestation gratuite)</label>}
      {canCost && <Input type="number" min={0} step="0.01" placeholder="Coût interne (privé, jamais dans les PDF)" value={open.internal_cost ?? ""} onChange={(e) => setOpen({ ...open, internal_cost: e.target.value })} />}
      <select aria-label="Matériau du catalogue commun" className={sel} value={open.material_id ?? ""} onChange={(e) => setOpen({ ...open, material_id: e.target.value })}><option value="">Matériau du catalogue commun (facultatif)</option>{mats.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
      <Input placeholder="Équipement (ex. excavatrice 20 t)" value={open.equipment_ref ?? ""} onChange={(e) => setOpen({ ...open, equipment_ref: e.target.value })} />
      <Textarea placeholder="Inclusions" value={open.inclusions ?? ""} onChange={(e) => setOpen({ ...open, inclusions: e.target.value })} />
      <Textarea placeholder="Exclusions" value={open.exclusions ?? ""} onChange={(e) => setOpen({ ...open, exclusions: e.target.value })} />
      <label className="text-xs">Validité<Input type="date" value={open.valid_until ?? ""} onChange={(e) => setOpen({ ...open, valid_until: e.target.value })} /></label>
      <Textarea placeholder="Notes privées" value={open.private_notes ?? ""} onChange={(e) => setOpen({ ...open, private_notes: e.target.value })} />
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!!open.is_demo} onChange={(e) => setOpen({ ...open, is_demo: e.target.checked })} />Exemple fictif de démonstration</label>
      <Button onClick={save}>Enregistrer</Button></DialogContent></Dialog>;

}

function TplDialog({ initial, companyId, canCost, mats, onClose, onSaved }: any) {
  const { user: me } = useAuthReady(); const [tpl, setTpl] = useState<any>(initial); const [stale, setStale] = useState<any>(null); const busy = useRef(false);
  const init = useMemo(() => JSON.stringify(initial), []); // eslint-disable-line react-hooks/exhaustive-deps
  const store = useDraft({
    id: me ? { module: "crm", form: "modele", owner: me.id, company: companyId, recordId: initial.id ?? null } : null,
    data: { v: tpl, base: initial.updated_at ?? null },
    label: (d) => `CRM — Modèle de soumission ${d.v.name ? `« ${d.v.name} »` : "(nouveau)"}`,
    route: `/entrepreneur/crm?company=${companyId}&tab=services&tpl=${initial.id ?? "nouveau"}`,
    isEmpty: (d) => JSON.stringify(d.v) === init,
    onRestore: (d) => { if (initial.id && d.base && initial.updated_at && d.base !== initial.updated_at) setStale(d.v); else setTpl((x: any) => ({ ...x, ...d.v })); },
  });
  const saveTpl = async () => { if (busy.current) return; busy.current = true; try { const { id, created_at, created_by, company_id, ...rest } = tpl; const { error } = id ? await db.from("ent_crm_templates").update({ ...rest, updated_at: new Date().toISOString() }).eq("id", id) : await db.from("ent_crm_templates").insert({ ...rest, company_id: companyId }); if (error) toast({ title: "Refusé — votre saisie est conservée", description: error.message }); else { store.finalize(); onSaved(); } } finally { busy.current = false; } };

  return <Dialog open onOpenChange={onClose}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Modèle de soumission</DialogTitle></DialogHeader>
      <DraftStatusBar status={store.status} savedAt={store.savedAt} restored={!!store.restoredMeta} onDiscard={() => { store.discard(); setTpl(initial); setStale(null); }} discardConfirm="Abandonner la préparation de modèle de soumission ? Les saisies non enregistrées seront effacées; rien d'enregistré n'est modifié." sync={store.sync} synced={store.synced} conflict={store.conflict} onUseServer={store.useServerVersion} onKeepLocal={store.keepLocalVersion} onRestartAsNew={store.restartAsNew} restartError={store.restartError} onRetry={store.retrySave} />
      {stale && <div role="alert" className="rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-xs">Cette fiche a été modifiée ailleurs depuis votre préparation. L'état actuel est affiché; votre saisie est conservée à part.<div className="mt-1 flex gap-2"><Button size="sm" variant="outline" onClick={() => { setTpl((x: any) => ({ ...x, ...stale })); setStale(null); }}>Appliquer ma saisie préparée</Button><Button size="sm" variant="ghost" onClick={() => setStale(null)}>Garder l'état actuel</Button></div></div>}
      <Input placeholder="Nom" value={tpl.name} onChange={(e) => setTpl({ ...tpl, name: e.target.value })} />
      <select className={sel} value={tpl.trade} onChange={(e) => setTpl({ ...tpl, trade: e.target.value })}>{Object.entries(TRADES).map(([k, t]) => <option key={k} value={k}>{t.l}</option>)}</select>
      {(tpl.lines as QLine[]).map((l, i) => <div key={i} className="grid grid-cols-[6rem_1fr_6rem_2rem] gap-1">
        <Input placeholder="Section" value={l.section ?? ""} onChange={(e) => { const lines = [...tpl.lines]; lines[i] = { ...l, section: e.target.value }; setTpl({ ...tpl, lines }); }} />
        <Input placeholder="Ligne" value={l.desc} onChange={(e) => { const lines = [...tpl.lines]; lines[i] = { ...l, desc: e.target.value }; setTpl({ ...tpl, lines }); }} />
        <select className={sel} value={l.unit} onChange={(e) => { const lines = [...tpl.lines]; lines[i] = { ...l, unit: e.target.value }; setTpl({ ...tpl, lines }); }}>{UNITS.map((u) => <option key={u.v} value={u.v}>{u.l}</option>)}</select>
        <Button size="sm" variant="ghost" aria-label="Retirer la ligne" onClick={() => setTpl({ ...tpl, lines: tpl.lines.filter((_: any, j: number) => j !== i) })}>×</Button></div>)}
      <Button size="sm" variant="outline" onClick={() => setTpl({ ...tpl, lines: [...tpl.lines, { desc: "", qty: null, unit: "unite", price: null }] })}>+ Ligne</Button>
      <Textarea placeholder="Inclusions" value={tpl.inclusions ?? ""} onChange={(e) => setTpl({ ...tpl, inclusions: e.target.value })} />
      <Textarea placeholder="Exclusions" value={tpl.exclusions ?? ""} onChange={(e) => setTpl({ ...tpl, exclusions: e.target.value })} />
      <Textarea placeholder="Conditions" value={tpl.conditions ?? ""} onChange={(e) => setTpl({ ...tpl, conditions: e.target.value })} />
      <Button onClick={saveTpl}>Enregistrer</Button></DialogContent></Dialog>;
}
