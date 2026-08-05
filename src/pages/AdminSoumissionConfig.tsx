// Configuration des soumissions — structure de données administrable
// qui alimentera le moteur de calcul de Transport JSC.
// Aucun calcul, aucun prix affiché au client : uniquement la saisie.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Layers, MapPin, Truck, Percent, SlidersHorizontal, ShieldCheck, Loader2,
  ClipboardCheck, Network, LayoutDashboard, Building2, FileText, Tags,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import ResourceManager from "@/components/jsc/ResourceManager";
import QuoteValidation from "@/components/jsc/QuoteValidation";
import SupplyMatrix from "@/components/jsc/SupplyMatrix";
import AdminOverview from "@/components/jsc/AdminOverview";
import QuotesBoard from "@/components/jsc/QuotesBoard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  SOUMISSION_MATERIALS, SOUMISSION_QUARRIES, SOUMISSION_TRUCKS, SOUMISSION_TAXES,
  SOUMISSION_SETTINGS, SOUMISSION_SUPPLIERS, SOUMISSION_CATEGORIES,
} from "@/lib/jsc/soumission-config";

const TABS = [
  { id: "overview", label: "Tableau de bord", icon: LayoutDashboard },
  { id: "requests", label: "Demandes", icon: FileText },
  { id: "materials", label: "Matériaux", icon: Layers },
  { id: "categories", label: "Catégories", icon: Tags },
  { id: "quarries", label: "Carrières", icon: MapPin },
  { id: "suppliers", label: "Fournisseurs", icon: Building2 },
  { id: "supply", label: "Approvisionnement", icon: Network },
  { id: "trucks", label: "Camions", icon: Truck },
  { id: "taxes", label: "Taxes", icon: Percent },
  { id: "settings", label: "Paramètres", icon: SlidersHorizontal },
  { id: "validation", label: "Validation", icon: ClipboardCheck },
] as const;

type TabId = (typeof TABS)[number]["id"];

function GeneralSettings({ companyId }: { companyId: string | null }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [refOptions, setRefOptions] = useState<Record<string, { value: string; label: string }[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("jsc_settings")
      .select("key,value")
      .in("key", SOUMISSION_SETTINGS.map((s) => s.key));
    const next: Record<string, string> = {};
    for (const row of data ?? []) next[row.key] = row.value ?? "";
    setValues(next);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Options des paramètres de type « reference » (ex. point de départ des camions).
  useEffect(() => {
    void (async () => {
      const next: Record<string, { value: string; label: string }[]> = {};
      for (const def of SOUMISSION_SETTINGS) {
        if (def.type !== "reference" || !def.refTable) continue;
        const { data } = await supabase
          .from(def.refTable as "jsc_pickup_locations")
          .select("id,name")
          .eq("is_active", true)
          .is("archived_at", null)
          .order("name");
        next[def.key] = (data ?? []).map((r) => ({ value: r.id, label: r.name }));
      }
      setRefOptions(next);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    for (const def of SOUMISSION_SETTINGS) {
      const value = values[def.key] ?? "";
      const { data: existing } = await supabase
        .from("jsc_settings").select("id").eq("key", def.key).limit(1).maybeSingle();
      const res = existing
        ? await supabase.from("jsc_settings").update({ value }).eq("id", existing.id)
        : await supabase.from("jsc_settings").insert({
            key: def.key, label: def.label, category: "moteur_de_calcul",
            value_type: def.type === "number" ? "number" : "text",
            value, unit: def.unit ?? null, description: def.help,
            ...(companyId ? { company_id: companyId } : {}),
          });
      if (res.error) { toast.error(res.error.message); setSaving(false); return; }
    }
    setSaving(false);
    toast.success("Paramètres enregistrés.");
    void load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Paramètres du moteur</h2>
        <p className="text-sm text-muted-foreground">
          Toutes les valeurs utilisées par le moteur de soumission. Chaque modification est appliquée
          immédiatement au prochain calcul — aucune intervention dans le code n'est requise.
        </p>
      </div>
      {([
        ["operation", "Opérations et temps"],
        ["financier", "Paramètres financiers"],
      ] as const).map(([group, title]) => (
        <section key={group} className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
        {SOUMISSION_SETTINGS.filter((d) => (d.group ?? "operation") === group).map((def) => (
          <div key={def.key} className="space-y-1.5 rounded-lg border p-4">
            <Label>{def.label}</Label>
            {def.type === "select" || def.type === "reference" ? (
              <Select
                value={values[def.key] ?? ""}
                onValueChange={(v) => setValues((s) => ({ ...s, [def.key]: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
                <SelectContent>
                  {(def.type === "reference" ? refOptions[def.key] ?? [] : def.options ?? []).map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="any"
                  value={values[def.key] ?? ""}
                  onChange={(e) => setValues((s) => ({ ...s, [def.key]: e.target.value }))}
                />
                {def.unit && <span className="text-sm text-muted-foreground">{def.unit}</span>}
              </div>
            )}
            <p className="text-xs text-muted-foreground">{def.help}</p>
          </div>
        ))}
          </div>
        </section>
      ))}
      <Button onClick={save} disabled={saving}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Enregistrer les paramètres
      </Button>
    </div>
  );
}

export default function AdminSoumissionConfig() {
  const { isReady, user } = useAuthReady();
  const { isAdmin, loading: rolesLoading } = useUserRoles(user, isReady);
  const [tab, setTab] = useState<TabId>("overview");
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    void (async () => {
      const { data } = await supabase
        .from("jsc_companies").select("id,is_default").is("archived_at", null).order("created_at");
      const list = data ?? [];
      setCompanyId(list.find((c) => c.is_default)?.id ?? list[0]?.id ?? null);
    })();
  }, [isAdmin]);

  if (!isReady || rolesLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Vérification des permissions…
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <ShieldCheck className="h-8 w-8 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Accès réservé</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          La configuration des soumissions est accessible uniquement aux administrateurs.
        </p>
        <Link to="/" className="text-sm text-primary hover:underline">Retour à l'accueil</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-5">
          <Link to="/admin" className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Retour à l'administration
          </Link>
          <h1 className="text-2xl font-bold">Panneau d'administration</h1>
          <p className="text-sm text-muted-foreground">
            Matériaux, catégories, carrières, fournisseurs, camions, taxes, paramètres financiers et demandes.
            Toute l'entreprise se gère ici, sans modifier le code.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-7xl gap-6 px-4 py-6 lg:flex">
        <nav className="mb-4 flex gap-2 overflow-x-auto lg:mb-0 lg:w-64 lg:flex-col">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex w-full shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                tab === id
                  ? "border-primary bg-primary/10 font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="whitespace-nowrap">{label}</span>
            </button>
          ))}
        </nav>

        <main className="min-w-0 flex-1">
          {tab === "overview" && <AdminOverview />}
          {tab === "requests" && <QuotesBoard />}
          {tab === "materials" && <ResourceManager resource={SOUMISSION_MATERIALS} companyId={companyId} />}
          {tab === "categories" && <ResourceManager resource={SOUMISSION_CATEGORIES} companyId={companyId} />}
          {tab === "quarries" && <ResourceManager resource={SOUMISSION_QUARRIES} companyId={companyId} />}
          {tab === "suppliers" && <ResourceManager resource={SOUMISSION_SUPPLIERS} companyId={companyId} />}
          {tab === "supply" && <SupplyMatrix />}
          {tab === "trucks" && <ResourceManager resource={SOUMISSION_TRUCKS} companyId={companyId} />}
          {tab === "taxes" && <ResourceManager resource={SOUMISSION_TAXES} companyId={companyId} />}
          {tab === "settings" && <GeneralSettings companyId={companyId} />}
          {tab === "validation" && <QuoteValidation companyId={companyId} />}
        </main>
      </div>
    </div>
  );
}
