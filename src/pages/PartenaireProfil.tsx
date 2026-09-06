// ============================================================
// PROFIL ENTREPRISE PARTENAIRE (place de marché Vrac Québec)
// Sert à l'affichage public, au jumelage, aux demandes de
// soumissions et aux vérifications internes. Une entreprise peut
// cumuler plusieurs rôles, services, territoires et clientèles.
// L'isolation des données est appliquée par la base (RLS).
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Plus, Save, Search, Trash2 } from "lucide-react";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import { useFleetTenant } from "@/lib/fleet/tenant";
import { CompanySwitcher, SupportBanner } from "@/components/fleet/FleetTenantBar";
import FullPageState from "@/components/FullPageState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  ensurePartner, fetchCategories, fetchPartnerPreferences, partnerBusinessRoles,
  partnerClientTypes, partnerDocuments, partnerEquipment, partnerServices,
  partnerAvailability, partnerTerritories, savePartner, savePartnerPreferences,
} from "@/lib/marketplace/api";
import {
  AVAILABILITY_STATUSES, BUSINESS_ROLES, PARTNER_CLIENT_TYPES, PROJECT_SIZES,
  type MarketplacePartner, type ServiceCategory,
} from "@/lib/marketplace/types";

type Row = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const num = (v: string) => (v.trim() === "" ? null : Number(v));

const DOC_TYPES = [
  "Assurance responsabilité", "Licence RBQ", "Permis", "Attestation CNESST",
  "Attestation Revenu Québec", "Certificat", "Autre document",
];

const EQUIPMENT_TYPES = [
  "Camion 10 roues", "Camion 12 roues", "Semi-dompeur", "Fardier", "Pelle",
  "Mini-pelle", "Chargeur", "Bulldozer", "Skid steer", "Rouleau compacteur", "Niveleuse",
];

/** Case à cocher simple et lisible sur mobile. */
function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-body cursor-pointer hover:bg-muted/50">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-primary h-4 w-4" />
      <span>{label}</span>
    </label>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export default function PartenaireProfil() {
  const { user, isReady, isAuthenticated } = useAuthReady();
  const { isAdmin, loading: roleLoading } = useUserRoles(user, isReady);
  const tenant = useFleetTenant(isAdmin, isReady && !roleLoading && isAuthenticated);
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [partner, setPartner] = useState<MarketplacePartner | null>(null);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [clientTypes, setClientTypes] = useState<string[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [territories, setTerritories] = useState<Row[]>([]);
  const [equipment, setEquipment] = useState<Row[]>([]);
  const [documents, setDocuments] = useState<Row[]>([]);
  const [availability, setAvailability] = useState<Row[]>([]);
  const [prefs, setPrefs] = useState<Row>({});
  const [serviceSearch, setServiceSearch] = useState("");

  const companyId = tenant.companyId;

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [p, cats, br, ct, sv, tr, eq, docs, pr, av] = await Promise.all([
        ensurePartner(companyId),
        fetchCategories(true),
        partnerBusinessRoles.list(companyId),
        partnerClientTypes.list(companyId),
        partnerServices.list(companyId),
        partnerTerritories.list(companyId),
        partnerEquipment.list(companyId),
        partnerDocuments.list(companyId),
        fetchPartnerPreferences(companyId),
        partnerAvailability.list(companyId),
      ]);
      setPartner(p);
      setCategories(cats);
      setRoles(br.filter((r) => r.is_active !== false).map((r) => s(r.business_role)));
      setClientTypes(ct.map((r) => s(r.client_type)));
      setServices(sv.filter((r) => r.is_active !== false).map((r) => s(r.category_id)));
      setTerritories(tr);
      setEquipment(eq);
      setDocuments(docs);
      setPrefs(pr ?? {});
      setAvailability(av);
    } catch (e) {
      toast({ title: "Chargement impossible", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [companyId, toast]);

  useEffect(() => { void load(); }, [load]);

  const patch = (updates: Partial<MarketplacePartner>) =>
    setPartner((prev) => (prev ? { ...prev, ...updates } : prev));

  const saveIdentity = async () => {
    if (!companyId || !partner) return;
    setSaving(true);
    try {
      const { id, company_id, ...rest } = partner as MarketplacePartner & Row;
      await savePartner(companyId, rest as Partial<MarketplacePartner>);
      toast({ title: "Profil enregistré" });
    } catch (e) {
      toast({ title: "Enregistrement impossible", description: (e as Error).message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  /** Synchronise une liste de valeurs simples (rôles, clientèles, services). */
  const syncList = async (
    api: typeof partnerBusinessRoles, column: string,
    current: string[], next: string[], extra: Row = {},
  ) => {
    if (!companyId) return;
    const rows = await api.list(companyId);
    const toAdd = next.filter((v) => !current.includes(v));
    const toRemove = rows.filter((r) => !next.includes(s(r[column])));
    await Promise.all([
      ...toAdd.map((v) => api.save({ company_id: companyId, [column]: v, ...extra })),
      ...toRemove.map((r) => api.remove(s(r.id))),
    ]);
  };

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const saveRoles = async () => {
    setSaving(true);
    try {
      await syncList(partnerBusinessRoles, "business_role", [], roles);
      await syncList(partnerClientTypes, "client_type", [], clientTypes);
      toast({ title: "Rôles et clientèles enregistrés" });
      await load();
    } catch (e) {
      toast({ title: "Enregistrement impossible", description: (e as Error).message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const saveServices = async () => {
    setSaving(true);
    try {
      await syncList(partnerServices, "category_id", [], services);
      toast({ title: "Services enregistrés" });
      await load();
    } catch (e) {
      toast({ title: "Enregistrement impossible", description: (e as Error).message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const savePrefs = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      await savePartnerPreferences(companyId, {
        category_ids: (prefs.category_ids as string[]) ?? [],
        regions: (prefs.regions as string[]) ?? [],
        cities: (prefs.cities as string[]) ?? [],
        radius_km: prefs.radius_km ?? null,
        min_project_amount: prefs.min_project_amount ?? null,
        max_project_amount: prefs.max_project_amount ?? null,
        client_types: (prefs.client_types as string[]) ?? [],
        notify_in_app: prefs.notify_in_app ?? true,
        notify_email: prefs.notify_email ?? true,
        notify_sms: prefs.notify_sms ?? false,
      });
      toast({ title: "Préférences enregistrées" });
    } catch (e) {
      toast({ title: "Enregistrement impossible", description: (e as Error).message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const upsertChild = async (
    api: typeof partnerEquipment, row: Row, refresh: () => Promise<void>,
  ) => {
    if (!companyId) return;
    try {
      await api.save({ ...row, company_id: companyId });
      await refresh();
    } catch (e) {
      toast({ title: "Enregistrement impossible", description: (e as Error).message, variant: "destructive" });
    }
  };

  const removeChild = async (api: typeof partnerEquipment, id: string, refresh: () => Promise<void>) => {
    try { await api.remove(id); await refresh(); }
    catch (e) { toast({ title: "Suppression impossible", description: (e as Error).message, variant: "destructive" }); }
  };

  const refreshTerritories = async () => companyId && setTerritories(await partnerTerritories.list(companyId));
  const refreshEquipment = async () => companyId && setEquipment(await partnerEquipment.list(companyId));
  const refreshDocuments = async () => companyId && setDocuments(await partnerDocuments.list(companyId));
  const refreshAvailability = async () => companyId && setAvailability(await partnerAvailability.list(companyId));

  // Services (feuilles) groupés par grande catégorie, filtrables.
  const serviceGroups = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    const rootOf = (c: ServiceCategory): ServiceCategory => {
      let cur = c;
      while (cur.parent_id && byId.get(cur.parent_id)) cur = byId.get(cur.parent_id)!;
      return cur;
    };
    const term = serviceSearch.trim().toLowerCase();
    const leaves = categories.filter((c) => c.level === "service" || c.level === "sous_categorie");
    const groups = new Map<string, { name: string; items: ServiceCategory[] }>();
    leaves.forEach((c) => {
      if (term && !c.name.toLowerCase().includes(term)) return;
      const root = rootOf(c);
      const g = groups.get(root.id) ?? { name: root.name, items: [] };
      g.items.push(c);
      groups.set(root.id, g);
    });
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [categories, serviceSearch]);

  if (!isReady || roleLoading) {
    return <FullPageState title="Chargement" />;
  }
  if (!isAuthenticated) {
    return <FullPageState showSpinner={false} title="Connexion requise" message="Connectez-vous pour gérer votre profil d'entreprise." />;
  }
  if (!tenant.loading && !companyId) {
    return <FullPageState showSpinner={false} title="Aucune entreprise" message="Votre compte n'est rattaché à aucune entreprise partenaire." />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 space-y-4">
        <SupportBanner tenant={tenant} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link to="/"><ArrowLeft className="mr-2 h-4 w-4" /> Accueil</Link>
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/partenaire/soumissions">Mes soumissions</Link>
            </Button>
            <CompanySwitcher tenant={tenant} />
          </div>
        </div>

        <div>
          <h1 className="font-display text-2xl md:text-3xl">Profil d'entreprise partenaire</h1>
          <p className="text-sm text-muted-foreground font-body">
            Ces informations servent à vous proposer les demandes de soumissions les plus pertinentes.
          </p>
        </div>

        {loading || tenant.loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : partner && (
          <Tabs defaultValue="identite">
            <TabsList className="flex w-full flex-wrap h-auto justify-start gap-1">
              <TabsTrigger value="identite">Identité</TabsTrigger>
              <TabsTrigger value="services">Services</TabsTrigger>
              <TabsTrigger value="territoire">Territoires</TabsTrigger>
              <TabsTrigger value="equipements">Équipements</TabsTrigger>
              <TabsTrigger value="capacite">Capacité</TabsTrigger>
              <TabsTrigger value="disponibilite">Disponibilité</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="preferences">Préférences</TabsTrigger>
            </TabsList>

            {/* ---------------- Identité ---------------- */}
            <TabsContent value="identite" className="mt-4 space-y-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Identité de l'entreprise</CardTitle></CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nom commercial"><Input value={s(partner.trade_name)} onChange={(e) => patch({ trade_name: e.target.value })} /></Field>
                  <Field label="Nom légal"><Input value={s(partner.legal_name)} onChange={(e) => patch({ legal_name: e.target.value })} /></Field>
                  <Field label="NEQ"><Input value={s(partner.neq)} onChange={(e) => patch({ neq: e.target.value })} /></Field>
                  <Field label="Année de fondation"><Input inputMode="numeric" value={s(partner.founded_year)} onChange={(e) => patch({ founded_year: num(e.target.value) })} /></Field>
                  <Field label="Site web"><Input value={s(partner.website)} onChange={(e) => patch({ website: e.target.value })} /></Field>
                  <Field label="Logo (adresse de l'image)"><Input value={s(partner.logo_url)} onChange={(e) => patch({ logo_url: e.target.value })} /></Field>
                  <Field label="Téléphone"><Input value={s(partner.phone)} onChange={(e) => patch({ phone: e.target.value })} /></Field>
                  <Field label="Courriel"><Input value={s(partner.email)} onChange={(e) => patch({ email: e.target.value })} /></Field>
                  <Field label="Personne-ressource"><Input value={s(partner.contact_name)} onChange={(e) => patch({ contact_name: e.target.value })} /></Field>
                  <Field label="Adresse"><Input value={s(partner.address)} onChange={(e) => patch({ address: e.target.value })} /></Field>
                  <Field label="Ville"><Input value={s(partner.city)} onChange={(e) => patch({ city: e.target.value })} /></Field>
                  <Field label="Région"><Input value={s(partner.region)} onChange={(e) => patch({ region: e.target.value })} /></Field>
                  <Field label="Code postal"><Input value={s(partner.postal_code)} onChange={(e) => patch({ postal_code: e.target.value })} /></Field>
                  <div className="sm:col-span-2">
                    <Field label="Description"><Textarea rows={4} value={s(partner.description)} onChange={(e) => patch({ description: e.target.value })} /></Field>
                  </div>
                  <div className="sm:col-span-2 flex items-center justify-between rounded-lg border border-border px-3 py-2">
                    <div>
                      <p className="text-sm font-body">Fiche visible dans l'annuaire public</p>
                      <p className="text-xs text-muted-foreground">Vos coordonnées restent masquées aux visiteurs non connectés.</p>
                    </div>
                    <Switch checked={!!partner.is_public} onCheckedChange={(v) => patch({ is_public: v })} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Rôles commerciaux et clientèles</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="mb-2 text-xs text-muted-foreground">Une entreprise peut cumuler plusieurs rôles.</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {BUSINESS_ROLES.map((r) => (
                        <Check key={r.value} label={r.label} checked={roles.includes(r.value)} onChange={() => setRoles(toggle(roles, r.value))} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs text-muted-foreground">Types de clientèle acceptés</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {PARTNER_CLIENT_TYPES.map((c) => (
                        <Check key={c.value} label={c.label} checked={clientTypes.includes(c.value)} onChange={() => setClientTypes(toggle(clientTypes, c.value))} />
                      ))}
                    </div>
                  </div>
                  <Button onClick={saveRoles} disabled={saving}><Save className="mr-2 h-4 w-4" /> Enregistrer les rôles</Button>
                </CardContent>
              </Card>

              <Button onClick={saveIdentity} disabled={saving} className="w-full sm:w-auto">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Enregistrer l'identité
              </Button>
            </TabsContent>

            {/* ---------------- Services ---------------- */}
            <TabsContent value="services" className="mt-4 space-y-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Services offerts ({services.length})</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Rechercher un service" value={serviceSearch} onChange={(e) => setServiceSearch(e.target.value)} />
                  </div>
                  {serviceGroups.map((g) => (
                    <div key={g.name}>
                      <p className="mb-2 text-sm font-display">{g.name}</p>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {g.items.map((c) => (
                          <Check key={c.id} label={c.name} checked={services.includes(c.id)} onChange={() => setServices(toggle(services, c.id))} />
                        ))}
                      </div>
                    </div>
                  ))}
                  <Button onClick={saveServices} disabled={saving}><Save className="mr-2 h-4 w-4" /> Enregistrer les services</Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ---------------- Territoires ---------------- */}
            <TabsContent value="territoire" className="mt-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Territoires desservis</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {territories.length === 0 && <p className="text-sm text-muted-foreground">Aucun territoire ajouté.</p>}
                  {territories.map((t) => (
                    <div key={s(t.id)} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-5">
                      <select
                        className="h-10 rounded-lg border border-border bg-background px-2 text-sm"
                        value={s(t.scope) || "ville"}
                        onChange={(e) => void upsertChild(partnerTerritories, { ...t, scope: e.target.value }, refreshTerritories)}
                      >
                        <option value="ville">Ville</option>
                        <option value="region">Région</option>
                        <option value="rayon">Rayon</option>
                        <option value="province">Province</option>
                      </select>
                      <Input placeholder="Ville" defaultValue={s(t.city)} onBlur={(e) => void upsertChild(partnerTerritories, { ...t, city: e.target.value }, refreshTerritories)} />
                      <Input placeholder="Région" defaultValue={s(t.region)} onBlur={(e) => void upsertChild(partnerTerritories, { ...t, region: e.target.value }, refreshTerritories)} />
                      <Input placeholder="Rayon (km)" inputMode="numeric" defaultValue={s(t.radius_km)} onBlur={(e) => void upsertChild(partnerTerritories, { ...t, radius_km: num(e.target.value) }, refreshTerritories)} />
                      <Button variant="ghost" size="sm" onClick={() => void removeChild(partnerTerritories, s(t.id), refreshTerritories)}>
                        <Trash2 className="h-4 w-4" /> Retirer
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" onClick={() => void upsertChild(partnerTerritories, { scope: "ville" }, refreshTerritories)}>
                    <Plus className="mr-2 h-4 w-4" /> Ajouter un territoire
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ---------------- Équipements ---------------- */}
            <TabsContent value="equipements" className="mt-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Équipements disponibles</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {equipment.length === 0 && <p className="text-sm text-muted-foreground">Aucun équipement ajouté.</p>}
                  {equipment.map((eq) => (
                    <div key={s(eq.id)} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-5">
                      <Input list="vq-equipements" placeholder="Type" defaultValue={s(eq.equipment_type)} onBlur={(e) => void upsertChild(partnerEquipment, { ...eq, equipment_type: e.target.value }, refreshEquipment)} />
                      <Input placeholder="Description" defaultValue={s(eq.description)} onBlur={(e) => void upsertChild(partnerEquipment, { ...eq, description: e.target.value }, refreshEquipment)} />
                      <Input placeholder="Quantité" inputMode="numeric" defaultValue={s(eq.quantity)} onBlur={(e) => void upsertChild(partnerEquipment, { ...eq, quantity: Number(e.target.value || 1) }, refreshEquipment)} />
                      <Input placeholder="Capacité" defaultValue={s(eq.capacity)} onBlur={(e) => void upsertChild(partnerEquipment, { ...eq, capacity: e.target.value }, refreshEquipment)} />
                      <div className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-xs">
                          <Switch checked={eq.is_active !== false} onCheckedChange={(v) => void upsertChild(partnerEquipment, { ...eq, is_active: v }, refreshEquipment)} />
                          Actif
                        </label>
                        <Button variant="ghost" size="sm" onClick={() => void removeChild(partnerEquipment, s(eq.id), refreshEquipment)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  ))}
                  <datalist id="vq-equipements">{EQUIPMENT_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
                  <Button variant="outline" onClick={() => void upsertChild(partnerEquipment, { equipment_type: "Camion 10 roues", quantity: 1 }, refreshEquipment)}>
                    <Plus className="mr-2 h-4 w-4" /> Ajouter un équipement
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ---------------- Capacité ---------------- */}
            <TabsContent value="capacite" className="mt-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Capacité de travaux et disponibilité</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2 sm:grid-cols-4">
                    {PROJECT_SIZES.map((p) => (
                      <Check
                        key={p.value} label={p.label}
                        checked={(partner.project_sizes ?? []).includes(p.value)}
                        onChange={() => patch({ project_sizes: toggle(partner.project_sizes ?? [], p.value) })}
                      />
                    ))}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Check label="Appels d'offres" checked={!!partner.accepts_tenders} onChange={(v) => patch({ accepts_tenders: v })} />
                    <Check label="Sous-traitance" checked={!!partner.accepts_subcontracting} onChange={(v) => patch({ accepts_subcontracting: v })} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Montant minimal souhaité ($)"><Input inputMode="numeric" value={s(partner.min_project_amount)} onChange={(e) => patch({ min_project_amount: num(e.target.value) })} /></Field>
                    <Field label="Montant maximal indicatif ($)"><Input inputMode="numeric" value={s(partner.max_project_amount)} onChange={(e) => patch({ max_project_amount: num(e.target.value) })} /></Field>
                    <Field label="Distance maximale (km)"><Input inputMode="numeric" value={s(partner.max_distance_km)} onChange={(e) => patch({ max_distance_km: num(e.target.value) })} /></Field>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Disponibilité actuelle">
                      <select
                        className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
                        value={s(partner.availability_status) || "disponible"}
                        onChange={(e) => patch({ availability_status: e.target.value })}
                      >
                        {AVAILABILITY_STATUSES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                      </select>
                    </Field>
                    <Field label="Précision (facultatif)"><Input value={s(partner.availability_note)} onChange={(e) => patch({ availability_note: e.target.value })} placeholder="Ex. : 3 camions disponibles lundi" /></Field>
                  </div>
                  <Button onClick={saveIdentity} disabled={saving}><Save className="mr-2 h-4 w-4" /> Enregistrer la capacité</Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ---------------- Documents ---------------- */}

            {/* ---------------- Disponibilité ---------------- */}
            <TabsContent value="disponibilite" className="mt-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Disponibilité et capacité</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Statut général">
                      <select
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={s(partner?.availability_status) || "disponible"}
                        onChange={(e) => patch({ availability_status: e.target.value })}
                      >
                        {AVAILABILITY_STATUSES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                      </select>
                    </Field>
                    <Field label="Précision (facultatif)">
                      <Input value={s(partner?.availability_note)} onChange={(e) => patch({ availability_note: e.target.value })}
                        placeholder="Ex. : 3 camions disponibles lundi" />
                    </Field>
                  </div>
                  <Button onClick={saveIdentity} disabled={saving}><Save className="mr-2 h-4 w-4" /> Enregistrer le statut</Button>

                  <p className="pt-2 text-xs text-muted-foreground">
                    Périodes précises (facultatif). Ces informations aident le jumelage, mais une entreprise
                    n'est jamais écartée parce que son calendrier n'est pas à jour.
                  </p>
                  {availability.length === 0 && <p className="text-sm text-muted-foreground">Aucune période ajoutée.</p>}
                  {availability.map((av) => (
                    <div key={s(av.id)} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-6">
                      <Input placeholder="Ressource (ex. : pelle)" defaultValue={s(av.resource_label)} onBlur={(e) => void upsertChild(partnerAvailability, { ...av, resource_label: e.target.value }, refreshAvailability)} />
                      <Input placeholder="Quantité" inputMode="numeric" defaultValue={s(av.quantity)} onBlur={(e) => void upsertChild(partnerAvailability, { ...av, quantity: Number(e.target.value || 1) }, refreshAvailability)} />
                      <Input type="date" defaultValue={s(av.starts_on)} onBlur={(e) => void upsertChild(partnerAvailability, { ...av, starts_on: e.target.value || null }, refreshAvailability)} />
                      <Input type="date" defaultValue={s(av.ends_on)} onBlur={(e) => void upsertChild(partnerAvailability, { ...av, ends_on: e.target.value || null }, refreshAvailability)} />
                      <select
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        defaultValue={s(av.status) || "disponible"}
                        onChange={(e) => void upsertChild(partnerAvailability, { ...av, status: e.target.value }, refreshAvailability)}
                      >
                        {AVAILABILITY_STATUSES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                      </select>
                      <div className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-xs">
                          <Switch checked={av.is_active !== false} onCheckedChange={(v) => void upsertChild(partnerAvailability, { ...av, is_active: v }, refreshAvailability)} />
                          Actif
                        </label>
                        <Button variant="ghost" size="sm" onClick={() => void removeChild(partnerAvailability, s(av.id), refreshAvailability)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" onClick={() => void upsertChild(partnerAvailability, { resource_label: "Camion 10 roues", quantity: 1, status: "disponible" }, refreshAvailability)}>
                    <Plus className="mr-2 h-4 w-4" /> Ajouter une période
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ---------------- Documents ---------------- */}
            <TabsContent value="documents" className="mt-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Documents et conformité</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Ajoutez les documents pertinents à votre type d'entreprise. Vrac Québec valide ensuite chaque document.
                  </p>
                  {documents.map((d) => (
                    <div key={s(d.id)} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-6">
                      <Input list="vq-doc-types" placeholder="Type" defaultValue={s(d.doc_type)} onBlur={(e) => void upsertChild(partnerDocuments, { ...d, doc_type: e.target.value }, refreshDocuments)} />
                      <Input placeholder="Nom" defaultValue={s(d.name)} onBlur={(e) => void upsertChild(partnerDocuments, { ...d, name: e.target.value }, refreshDocuments)} />
                      <Input placeholder="Émetteur" defaultValue={s(d.issuer)} onBlur={(e) => void upsertChild(partnerDocuments, { ...d, issuer: e.target.value }, refreshDocuments)} />
                      <Input type="date" defaultValue={s(d.issued_on)} onBlur={(e) => void upsertChild(partnerDocuments, { ...d, issued_on: e.target.value || null }, refreshDocuments)} />
                      <Input type="date" defaultValue={s(d.expires_on)} onBlur={(e) => void upsertChild(partnerDocuments, { ...d, expires_on: e.target.value || null }, refreshDocuments)} />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">{s(d.status) || "en_attente"}</span>
                        <Button variant="ghost" size="sm" onClick={() => void removeChild(partnerDocuments, s(d.id), refreshDocuments)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  ))}
                  <datalist id="vq-doc-types">{DOC_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
                  <Button variant="outline" onClick={() => void upsertChild(partnerDocuments, { doc_type: DOC_TYPES[0], name: "Nouveau document" }, refreshDocuments)}>
                    <Plus className="mr-2 h-4 w-4" /> Ajouter un document
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ---------------- Préférences ---------------- */}
            <TabsContent value="preferences" className="mt-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Préférences de soumissions</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="mb-2 text-xs text-muted-foreground">Grandes catégories pour lesquelles vous voulez recevoir des demandes</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {categories.filter((c) => c.level === "categorie").map((c) => {
                        const list = (prefs.category_ids as string[]) ?? [];
                        return (
                          <Check key={c.id} label={c.name} checked={list.includes(c.id)}
                            onChange={() => setPrefs({ ...prefs, category_ids: toggle(list, c.id) })} />
                        );
                      })}
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Régions (séparées par des virgules)">
                      <Input value={((prefs.regions as string[]) ?? []).join(", ")}
                        onChange={(e) => setPrefs({ ...prefs, regions: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })} />
                    </Field>
                    <Field label="Villes (séparées par des virgules)">
                      <Input value={((prefs.cities as string[]) ?? []).join(", ")}
                        onChange={(e) => setPrefs({ ...prefs, cities: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })} />
                    </Field>
                    <Field label="Rayon (km)"><Input inputMode="numeric" value={s(prefs.radius_km)} onChange={(e) => setPrefs({ ...prefs, radius_km: num(e.target.value) })} /></Field>
                    <Field label="Valeur minimale de projet ($)"><Input inputMode="numeric" value={s(prefs.min_project_amount)} onChange={(e) => setPrefs({ ...prefs, min_project_amount: num(e.target.value) })} /></Field>
                    <Field label="Valeur maximale de projet ($)"><Input inputMode="numeric" value={s(prefs.max_project_amount)} onChange={(e) => setPrefs({ ...prefs, max_project_amount: num(e.target.value) })} /></Field>
                  </div>
                  <div>
                    <p className="mb-2 text-xs text-muted-foreground">Types de clientèle souhaités</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {PARTNER_CLIENT_TYPES.map((c) => {
                        const list = (prefs.client_types as string[]) ?? [];
                        return (
                          <Check key={c.value} label={c.label} checked={list.includes(c.value)}
                            onChange={() => setPrefs({ ...prefs, client_types: toggle(list, c.value) })} />
                        );
                      })}
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Check label="Notifications dans l'application" checked={prefs.notify_in_app !== false} onChange={(v) => setPrefs({ ...prefs, notify_in_app: v })} />
                    <Check label="Notifications par courriel" checked={prefs.notify_email !== false} onChange={(v) => setPrefs({ ...prefs, notify_email: v })} />
                    <Check label="Notifications par SMS (à venir)" checked={prefs.notify_sms === true} onChange={(v) => setPrefs({ ...prefs, notify_sms: v })} />
                  </div>
                  <Button onClick={savePrefs} disabled={saving}><Save className="mr-2 h-4 w-4" /> Enregistrer les préférences</Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
