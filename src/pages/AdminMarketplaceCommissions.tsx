// ============================================================
// MODÈLE COMMERCIAL ET REVENUS — administration de la place de marché.
// Deux volets : les règles tarifaires (par entreprise, par catégorie ou
// globales) et le suivi des commissions générées à l'attribution.
// Les commissions conservent une copie figée de la règle appliquée :
// modifier une règle ne change jamais un contrat déjà attribué.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Coins, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import FullPageState from "@/components/FullPageState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  COMMISSION_STATUSES, PRICING_MODELS, commissionStatusLabel, deletePricingRule,
  fetchCategories, fetchCommissions, fetchPartnerCompanies, fetchPricingRules,
  pricingModelLabel, savePricingRule, setCommissionStatus,
} from "@/lib/marketplace/api";
import type { CommissionRow, PricingRule } from "@/lib/marketplace/api";
import type { ServiceCategory } from "@/lib/marketplace/types";

const argent = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 2 });

const SCOPES = [
  { value: "partenaire", label: "Facturé au partenaire" },
  { value: "client", label: "Facturé au client" },
  { value: "les_deux", label: "Partagé" },
];

const STATUTS_REGLE = [
  { value: "actif", label: "Actif" },
  { value: "brouillon", label: "Brouillon" },
  { value: "inactif", label: "Inactif" },
];

type Draft = Partial<PricingRule> & { label: string; model: string };

const NOUVELLE: Draft = {
  label: "", model: "commission_pourcentage", scope: "partenaire",
  status: "actif", priority: 0, company_id: null, category_id: null,
};

export default function AdminMarketplaceCommissions() {
  const { isReady, isAuthenticated } = useAuthReady();
  const { isAdmin, loading: roleLoading } = useUserRoles();
  const { toast } = useToast();

  const [onglet, setOnglet] = useState<"regles" | "revenus">("regles");
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [commissions, setCommissions] = useState<CommissionRow[]>([]);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [filtre, setFiltre] = useState("toutes");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, c, co, cat] = await Promise.all([
        fetchPricingRules(), fetchCommissions(), fetchPartnerCompanies(), fetchCategories(),
      ]);
      setRules(r);
      setCommissions(c);
      setCompanies(co);
      setCategories(cat);
    } catch (e) {
      toast({ title: "Chargement impossible", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (isReady && isAuthenticated && isAdmin) void load();
  }, [isReady, isAuthenticated, isAdmin, load]);

  const nomEntreprise = useCallback(
    (id: string | null) => (id ? companies.find((c) => c.id === id)?.name ?? "Entreprise" : "Toutes les entreprises"),
    [companies],
  );
  const nomCategorie = useCallback(
    (id: string | null) => (id ? categories.find((c) => c.id === id)?.name ?? "Catégorie" : "Toutes les catégories"),
    [categories],
  );

  const enregistrer = async (row: Draft) => {
    if (!row.label.trim()) {
      toast({ title: "Nom requis", description: "Donnez un nom à la règle.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await savePricingRule(row);
      setRules(await fetchPricingRules());
      setDraft(null);
      toast({ title: "Règle enregistrée" });
    } catch (e) {
      toast({ title: "Enregistrement impossible", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const supprimer = async (rule: PricingRule) => {
    if (!window.confirm(`Supprimer la règle « ${rule.label} » ?`)) return;
    setBusy(true);
    try {
      await deletePricingRule(rule.id);
      setRules(await fetchPricingRules());
      toast({ title: "Règle supprimée" });
    } catch (e) {
      toast({ title: "Suppression impossible", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const changerStatut = async (c: CommissionRow, status: string) => {
    setBusy(true);
    try {
      await setCommissionStatus(c.id, status);
      setCommissions(await fetchCommissions());
    } catch (e) {
      toast({ title: "Changement impossible", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const revenus = useMemo(() => {
    const liste = filtre === "toutes" ? commissions : commissions.filter((c) => c.status === filtre);
    const somme = (s: string[]) =>
      commissions.filter((c) => s.includes(c.status)).reduce((t, c) => t + Number(c.amount ?? 0), 0);
    return {
      liste,
      aConfirmer: somme(["a_confirmer"]),
      aFacturer: somme(["a_facturer"]),
      facturee: somme(["facturee"]),
      payee: somme(["payee"]),
      valeur: commissions.reduce((t, c) => t + Number(c.base_amount ?? 0), 0),
    };
  }, [commissions, filtre]);

  if (!isReady || roleLoading) return <FullPageState title="Chargement" message="Vérification de l'accès…" />;
  if (!isAuthenticated) return <FullPageState title="Connexion requise" message="Connectez-vous pour accéder à cette page." showSpinner={false} />;
  if (!isAdmin) return <FullPageState title="Accès réservé" message="Cette section est réservée à l'administration de Vrac Québec." showSpinner={false} />;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/marche/soumissions"><ArrowLeft className="mr-2 h-4 w-4" />Gestion des soumissions</Link>
            </Button>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <Coins className="h-6 w-6 text-primary" /> Modèle commercial et revenus
            </h1>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" /> Actualiser
          </Button>
        </div>

        <div className="flex gap-2">
          <Button variant={onglet === "regles" ? "default" : "outline"} size="sm" onClick={() => setOnglet("regles")}>
            Règles tarifaires
          </Button>
          <Button variant={onglet === "revenus" ? "default" : "outline"} size="sm" onClick={() => setOnglet("revenus")}>
            Revenus et commissions
          </Button>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Chargement des données…</p>}

        {!loading && onglet === "regles" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setDraft({ ...NOUVELLE })}>
                <Plus className="mr-2 h-4 w-4" /> Nouvelle règle
              </Button>
            </div>

            {draft && (
              <Card>
                <CardHeader><CardTitle className="text-base">Règle tarifaire</CardTitle></CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <Label>Nom de la règle</Label>
                    <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                      placeholder="Ex. : Excavation — 5 % de commission" />
                  </div>
                  <div>
                    <Label>Modèle</Label>
                    <select className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })}>
                      {PRICING_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Facturation</Label>
                    <select className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={draft.scope ?? "partenaire"} onChange={(e) => setDraft({ ...draft, scope: e.target.value })}>
                      {SCOPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Entreprise</Label>
                    <select className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={draft.company_id ?? ""}
                      onChange={(e) => setDraft({ ...draft, company_id: e.target.value || null })}>
                      <option value="">Toutes les entreprises</option>
                      {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Catégorie</Label>
                    <select className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={draft.category_id ?? ""}
                      onChange={(e) => setDraft({ ...draft, category_id: e.target.value || null })}>
                      <option value="">Toutes les catégories</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Taux (%)</Label>
                    <Input type="number" step="0.01" value={draft.rate_percent ?? ""}
                      onChange={(e) => setDraft({ ...draft, rate_percent: e.target.value === "" ? null : Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label>Montant fixe ($)</Label>
                    <Input type="number" step="0.01" value={draft.fixed_amount ?? ""}
                      onChange={(e) => setDraft({ ...draft, fixed_amount: e.target.value === "" ? null : Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label>Abonnement ($ / mois)</Label>
                    <Input type="number" step="0.01" value={draft.subscription_amount ?? ""}
                      onChange={(e) => setDraft({ ...draft, subscription_amount: e.target.value === "" ? null : Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label>Crédits inclus</Label>
                    <Input type="number" value={draft.credits ?? ""}
                      onChange={(e) => setDraft({ ...draft, credits: e.target.value === "" ? null : Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label>Minimum ($)</Label>
                    <Input type="number" step="0.01" value={draft.min_amount ?? ""}
                      onChange={(e) => setDraft({ ...draft, min_amount: e.target.value === "" ? null : Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label>Maximum ($)</Label>
                    <Input type="number" step="0.01" value={draft.max_amount ?? ""}
                      onChange={(e) => setDraft({ ...draft, max_amount: e.target.value === "" ? null : Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label>Valide à partir du</Label>
                    <Input type="date" value={draft.valid_from ?? ""}
                      onChange={(e) => setDraft({ ...draft, valid_from: e.target.value || null })} />
                  </div>
                  <div>
                    <Label>Valide jusqu'au</Label>
                    <Input type="date" value={draft.valid_until ?? ""}
                      onChange={(e) => setDraft({ ...draft, valid_until: e.target.value || null })} />
                  </div>
                  <div>
                    <Label>Priorité</Label>
                    <Input type="number" value={draft.priority ?? 0}
                      onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label>Statut</Label>
                    <select className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={draft.status ?? "actif"} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                      {STATUTS_REGLE.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <Label>Notes internes</Label>
                    <Textarea value={draft.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
                  </div>
                  <div className="flex gap-2 md:col-span-2">
                    <Button onClick={() => void enregistrer(draft)} disabled={busy}>
                      {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Enregistrer
                    </Button>
                    <Button variant="ghost" onClick={() => setDraft(null)}>Annuler</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {rules.length === 0 && (
              <Card><CardContent className="p-6 text-sm text-muted-foreground">
                Aucune règle tarifaire. Sans règle applicable, aucun revenu n'est calculé à l'attribution.
              </CardContent></Card>
            )}

            <div className="grid gap-3">
              {rules.map((r) => (
                <Card key={r.id}>
                  <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                    <div className="space-y-1">
                      <p className="font-semibold">{r.label}</p>
                      <p className="text-sm text-muted-foreground">
                        {pricingModelLabel(r.model)}
                        {r.rate_percent != null && ` · ${r.rate_percent} %`}
                        {r.fixed_amount != null && ` · ${argent(r.fixed_amount)}`}
                        {r.subscription_amount != null && ` · abonnement ${argent(r.subscription_amount)}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {nomEntreprise(r.company_id)} · {nomCategorie(r.category_id)} · priorité {r.priority}
                        {" · "}{STATUTS_REGLE.find((s) => s.value === r.status)?.label ?? r.status}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setDraft({ ...r })}>Modifier</Button>
                      <Button variant="ghost" size="sm" onClick={() => void supprimer(r)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {!loading && onglet === "revenus" && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                { label: "Valeur des contrats", v: revenus.valeur },
                { label: "À confirmer", v: revenus.aConfirmer },
                { label: "À facturer", v: revenus.aFacturer },
                { label: "Facturé", v: revenus.facturee },
                { label: "Encaissé", v: revenus.payee },
              ].map((k) => (
                <Card key={k.label}>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">{k.label}</p>
                    <p className="text-lg font-bold">{argent(k.v)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant={filtre === "toutes" ? "default" : "outline"} size="sm" onClick={() => setFiltre("toutes")}>
                Toutes
              </Button>
              {COMMISSION_STATUSES.map((s) => (
                <Button key={s.value} variant={filtre === s.value ? "default" : "outline"} size="sm"
                  onClick={() => setFiltre(s.value)}>{s.label}</Button>
              ))}
            </div>

            {revenus.liste.length === 0 && (
              <Card><CardContent className="p-6 text-sm text-muted-foreground">
                Aucun revenu enregistré pour ce filtre. Les revenus se créent automatiquement à l'attribution d'un contrat.
              </CardContent></Card>
            )}

            <div className="grid gap-3">
              {revenus.liste.map((c) => (
                <Card key={c.id}>
                  <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                    <div className="space-y-1">
                      <p className="font-semibold">
                        {c.request_number ?? "—"} · {c.request_title ?? "Projet"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {c.partner_name ?? "Entreprise"} · {pricingModelLabel(c.model)}
                        {c.label ? ` · ${c.label}` : ""}
                      </p>
                      <p className="text-sm">
                        Contrat {argent(c.base_amount)} → revenu <strong>{argent(c.amount)}</strong>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Statut : {commissionStatusLabel(c.status)}
                        {c.invoiced_at && ` · facturé le ${new Date(c.invoiced_at).toLocaleDateString("fr-CA")}`}
                        {c.paid_at && ` · payé le ${new Date(c.paid_at).toLocaleDateString("fr-CA")}`}
                      </p>
                    </div>
                    <select className="h-9 rounded-md border bg-background px-2 text-sm" value={c.status}
                      disabled={busy} onChange={(e) => void changerStatut(c, e.target.value)}>
                      {COMMISSION_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
