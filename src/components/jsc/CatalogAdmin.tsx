// Administration du catalogue central : matériaux, variantes, synonymes, provenance.
// Aucun code à modifier : un ajout actif apparaît dans Vrac, Remblai, CRM et tarifs.
// Les renommages / désactivations sont historisés (material_catalog_history).
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search, Tags } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { normalizeSearch } from "@/lib/vrac/sharedCatalog";

type Mat = { id: string; slug: string; name_fr: string; family: string; family_id: string | null; is_active: boolean; vrac_selectable: boolean; vrac_exclusion_reason: string | null; search_terms: string[] };
type Fam = { id: string; code: string; name_fr: string };
type Var = { id: string; material_id: string; code: string; label_fr: string; variant_kind: string; specification_code: string | null; specification_documented: boolean; is_active: boolean };
type Alias = { id: string; material_id: string; alias_raw: string; is_active: boolean; auto_match_allowed: boolean };
type Src = { id: string; row_ref: string; material_id: string | null; outcome: string; original_name: string; supplier_name: string | null; source_url: string | null; region: string | null; verified_on: string | null; outcome_reason: string | null };

const slugify = (s: string) => normalizeSearch(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const KINDS = ["calibre", "couleur", "composition", "specification", "qualite", "traitement"];

export default function CatalogAdmin({ onSetPrice }: { onSetPrice: (name: string) => void }) {
  const [mats, setMats] = useState<Mat[]>([]);
  const [fams, setFams] = useState<Fam[]>([]);
  const [vars, setVars] = useState<Var[]>([]);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [srcs, setSrcs] = useState<Src[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [qualifOnly, setQualifOnly] = useState(false);
  const [newMat, setNewMat] = useState({ name: "", family: "" });
  const [newVar, setNewVar] = useState({ label: "", kind: "calibre", spec: "" });
  const [newAlias, setNewAlias] = useState("");

  const load = useCallback(async () => {
    const [m, f, v, a, s] = await Promise.all([
      supabase.from("material_catalog").select("id,slug,name_fr,family,family_id,is_active,vrac_selectable,vrac_exclusion_reason,search_terms").order("family").order("name_fr"),
      supabase.from("material_families").select("id,code,name_fr").eq("level", "famille").order("display_order"),
      supabase.from("material_variants").select("id,material_id,code,label_fr,variant_kind,specification_code,specification_documented,is_active").order("display_order"),
      supabase.from("material_aliases").select("id,material_id,alias_raw,is_active,auto_match_allowed"),
      supabase.from("material_catalog_sources").select("id,row_ref,material_id,outcome,original_name,supplier_name,source_url,region,verified_on,outcome_reason").order("row_ref"),
    ]);
    if (m.error) toast.error(m.error.message);
    setMats((m.data ?? []) as Mat[]); setFams((f.data ?? []) as Fam[]); setVars((v.data ?? []) as Var[]);
    setAliases((a.data ?? []) as Alias[]); setSrcs((s.data ?? []) as Src[]); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    const nq = normalizeSearch(q);
    return mats.filter((m) => {
      if (qualifOnly && m.vrac_selectable && m.is_active) return false;
      if (!nq) return true;
      const hay = normalizeSearch([m.name_fr, m.family, ...vars.filter((v) => v.material_id === m.id).map((v) => v.label_fr), ...aliases.filter((a) => a.material_id === m.id).map((a) => a.alias_raw)].join(" "));
      return hay.includes(nq);
    });
  }, [mats, vars, aliases, q, qualifOnly]);

  const updMat = async (id: string, patch: Partial<Mat>) => {
    const { error } = await supabase.from("material_catalog").update(patch as never).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Enregistré (historisé)."); void load(); }
  };
  const addMat = async () => {
    const fam = fams.find((f) => f.code === newMat.family);
    if (!newMat.name.trim() || !fam) { toast.error("Nom et famille requis."); return; }
    const { error } = await supabase.from("material_catalog").insert({
      slug: slugify(newMat.name), name_fr: newMat.name.trim(), family: fam.code, family_id: fam.id, visible_detailed: true, vrac_selectable: true, display_order: 500,
    } as never);
    if (error) toast.error(error.message); else { toast.success("Matériau ajouté. Il est visible dans les modules concernés."); setNewMat({ name: "", family: "" }); void load(); }
  };
  const addVar = async (m: Mat) => {
    if (!newVar.label.trim()) return;
    const { error } = await supabase.from("material_variants").insert({
      material_id: m.id, code: slugify(newVar.label), label_fr: newVar.label.trim(), variant_kind: newVar.kind,
      specification_code: newVar.spec.trim() || null, specification_documented: !!newVar.spec.trim(),
    } as never);
    if (error) toast.error(error.message); else { setNewVar({ label: "", kind: "calibre", spec: "" }); void load(); }
  };
  const updVar = async (id: string, patch: Partial<Var>) => {
    const { error } = await supabase.from("material_variants").update(patch as never).eq("id", id);
    if (error) toast.error(error.message); else void load();
  };
  const addAlias = async (m: Mat) => {
    if (!newAlias.trim()) return;
    // Synonyme de recherche uniquement : jamais d'équivalence pour le matching ou la tarification.
    const { error } = await supabase.from("material_aliases").insert({
      material_id: m.id, alias_raw: newAlias.trim(), alias_norm: normalizeSearch(newAlias).replace(/[^a-z0-9/]+/g, " ").trim(),
      match_type: "semantic", confidence: "low", source: "admin", human_validated: true, auto_match_allowed: false,
    } as never);
    if (error) toast.error(error.message); else { setNewAlias(""); void load(); }
  };
  const toggleAlias = async (a: Alias) => {
    const { error } = await supabase.from("material_aliases").update({ is_active: !a.is_active } as never).eq("id", a.id);
    if (error) toast.error(error.message); else void load();
  };

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>;
  const toQualify = srcs.filter((s) => s.outcome === "a_qualifier" || s.outcome === "proposition_a_valider");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Catalogue des matériaux</h2>
        <p className="text-sm text-muted-foreground">
          Référentiel unique Vrac / Remblai / CRM / soumissions. Présence au catalogue ≠ stock, offre fournisseur ou acceptation en remblai.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
        {[["Familles", fams.length], ["Matériaux", mats.length], ["Variantes", vars.length], ["Synonymes", aliases.length], ["À qualifier / valider", toQualify.length]].map(([l, v]) => (
          <div key={l as string} className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="text-lg font-semibold">{v}</p></div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
        <div className="min-w-[200px] flex-1"><p className="text-xs text-muted-foreground">Nouveau matériau</p>
          <Input value={newMat.name} onChange={(e) => setNewMat({ ...newMat, name: e.target.value })} placeholder="Nom du matériau" /></div>
        <select className="h-10 rounded-md border bg-background px-2 text-sm" value={newMat.family} onChange={(e) => setNewMat({ ...newMat, family: e.target.value })} aria-label="Famille">
          <option value="">Famille…</option>{fams.map((f) => <option key={f.id} value={f.code}>{f.name_fr}</option>)}
        </select>
        <Button onClick={addMat}><Plus className="mr-1 h-4 w-4" /> Ajouter</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Rechercher (nom, variante, synonyme)" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button size="sm" variant={qualifOnly ? "default" : "outline"} onClick={() => setQualifOnly(!qualifOnly)}>Exclus / à qualifier</Button>
      </div>

      <div className="space-y-2">
        {rows.map((m) => {
          const mv = vars.filter((v) => v.material_id === m.id);
          const ma = aliases.filter((a) => a.material_id === m.id);
          const ms = srcs.filter((s) => s.material_id === m.id);
          const isOpen = open === m.id;
          return (
            <div key={m.id} className="rounded-xl border bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" className="text-left" onClick={() => setOpen(isOpen ? null : m.id)}>
                  <p className="font-medium">{m.name_fr} <span className="text-xs text-muted-foreground">· {m.family} · {mv.length} variante(s)</span></p>
                  {(!m.is_active || !m.vrac_selectable) && <p className="text-xs text-destructive">{m.vrac_exclusion_reason ?? (m.is_active ? "Non sélectionnable" : "Inactif")}</p>}
                </button>
                <div className="flex items-center gap-2 text-xs">
                  <span>Actif</span><Switch checked={m.is_active} onCheckedChange={(b) => updMat(m.id, { is_active: b })} />
                  <span>Vrac</span><Switch checked={m.vrac_selectable} onCheckedChange={(b) => updMat(m.id, { vrac_selectable: b, vrac_exclusion_reason: b ? null : (m.vrac_exclusion_reason ?? "Exclu par l'administrateur") })} />
                  <Button size="sm" variant="outline" onClick={() => onSetPrice(m.name_fr)}><Tags className="mr-1 h-4 w-4" /> Définir le prix</Button>
                </div>
              </div>
              {isOpen && (
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Fiche</p>
                    <Input defaultValue={m.name_fr} onBlur={(e) => e.target.value.trim() && e.target.value !== m.name_fr && updMat(m.id, { name_fr: e.target.value.trim() })} aria-label="Nom" />
                    <select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={m.family}
                      onChange={(e) => { const f = fams.find((x) => x.code === e.target.value); if (f) void updMat(m.id, { family: f.code, family_id: f.id }); }} aria-label="Famille">
                      {fams.map((f) => <option key={f.id} value={f.code}>{f.name_fr}</option>)}
                    </select>
                    <Input defaultValue={m.vrac_exclusion_reason ?? ""} placeholder="Motif d'exclusion / de qualification"
                      onBlur={(e) => (e.target.value || null) !== m.vrac_exclusion_reason && updMat(m.id, { vrac_exclusion_reason: e.target.value || null })} />
                    <p className="text-xs font-semibold uppercase text-muted-foreground pt-2">Synonymes (recherche seulement)</p>
                    <div className="flex flex-wrap gap-1">
                      {ma.map((a) => (
                        <Badge key={a.id} variant={a.is_active ? "secondary" : "outline"} className="cursor-pointer" onClick={() => toggleAlias(a)} title="Cliquer pour activer / désactiver">
                          {a.alias_raw}{!a.is_active && " (inactif)"}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-2"><Input value={newAlias} onChange={(e) => setNewAlias(e.target.value)} placeholder="Ajouter un synonyme" /><Button size="sm" onClick={() => addAlias(m)}>Ajouter</Button></div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Variantes commercialisables</p>
                    {mv.map((v) => (
                      <div key={v.id} className="flex items-center gap-2 text-sm">
                        <Input className="h-8" defaultValue={v.label_fr} onBlur={(e) => e.target.value.trim() && e.target.value !== v.label_fr && updVar(v.id, { label_fr: e.target.value.trim() })} />
                        <Badge variant="outline">{v.variant_kind}</Badge>
                        {v.specification_code && <Badge variant={v.specification_documented ? "default" : "outline"}>{v.specification_code}</Badge>}
                        <Switch checked={v.is_active} onCheckedChange={(b) => updVar(v.id, { is_active: b })} />
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-2">
                      <Input className="h-8 flex-1" value={newVar.label} onChange={(e) => setNewVar({ ...newVar, label: e.target.value })} placeholder="Nouvelle variante" />
                      <select className="h-8 rounded-md border bg-background px-1 text-xs" value={newVar.kind} onChange={(e) => setNewVar({ ...newVar, kind: e.target.value })}>
                        {KINDS.map((k) => <option key={k}>{k}</option>)}
                      </select>
                      <Input className="h-8 w-28" value={newVar.spec} onChange={(e) => setNewVar({ ...newVar, spec: e.target.value })} placeholder="Code documenté" />
                      <Button size="sm" onClick={() => addVar(m)}>Ajouter</Button>
                    </div>
                    {ms.length > 0 && (
                      <>
                        <p className="text-xs font-semibold uppercase text-muted-foreground pt-2">Provenance</p>
                        {ms.map((s) => (
                          <p key={s.id} className="text-xs text-muted-foreground">
                            {s.row_ref} · « {s.original_name} » · {s.supplier_name} · {s.region} · vérifié le {s.verified_on} · {s.outcome}
                          </p>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border bg-card p-3">
        <p className="mb-2 font-medium">Liste de qualification ({toQualify.length})</p>
        {toQualify.map((s) => (
          <p key={s.id} className="text-xs text-muted-foreground">{s.row_ref} · « {s.original_name} » — {s.outcome === "a_qualifier" ? "à qualifier" : "correspondance à valider"} · {s.outcome_reason}</p>
        ))}
      </div>
    </div>
  );
}
