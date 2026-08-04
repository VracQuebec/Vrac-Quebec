// ============================================================
// VALIDATION DES SOUMISSIONS — outil interne de vérification.
// Affiche chaque étape du calcul du moteur Transport JSC afin de
// comparer avec les soumissions réelles de Jonathan.
// AUCUN calcul ici : tout provient du moteur (quote-engine).
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { Loader2, ClipboardList, AlertTriangle, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getQuote, type PublicQuote, type QuoteUnit } from "@/lib/jsc/engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Material = { id: string; name: string };

type Trace = {
  distance?: Record<string, number>;
  time?: Record<string, number>;
  truck?: Record<string, unknown>;
  pickup?: Record<string, unknown>;
  base?: Record<string, unknown>;
  material?: Record<string, unknown>;
};

const nb = (v: unknown, digits = 2) =>
  typeof v === "number" && Number.isFinite(v) ? v.toFixed(digits) : "—";
const money = (v: unknown) => (typeof v === "number" ? `${v.toFixed(2)} $` : "—");

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

export default function QuoteValidation({ companyId }: { companyId: string | null }) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialId, setMaterialId] = useState<string>("");
  const [quantity, setQuantity] = useState("20");
  const [unit, setUnit] = useState<QuoteUnit>("tonne");
  const [address, setAddress] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pub, setPub] = useState<PublicQuote | null>(null);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [meta, setMeta] = useState<{ version: string; at: string } | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("jsc_materials")
        .select("id,name")
        .eq("is_active", true)
        .is("archived_at", null)
        .order("name");
      setMaterials((data as Material[]) ?? []);
    })();
  }, [companyId]);

  const run = async () => {
    setError(null);
    setPub(null);
    setTrace(null);
    if (!materialId) return toast.error("Choisissez un matériau.");
    if (!(Number(quantity) > 0)) return toast.error("Quantité invalide.");
    if (address.trim().length < 5) return toast.error("Adresse de livraison requise.");
    setLoading(true);
    try {
      const res = await getQuote({ material_id: materialId, quantity: Number(quantity), unit, address: address.trim() });
      setPub(res.quote.public);
      setMeta({ version: res.engine_version, at: res.computed_at });
      if (res.scope === "internal") setTrace(res.quote.technical.selected as Trace);
      else setError("Détail technique indisponible : compte non administrateur.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  const t = trace?.time ?? {};
  const d = trace?.distance ?? {};
  const minApplied = (t.raw_trip_minutes ?? 0) < (t.floored_trip_minutes ?? 0);

  const journal = useMemo(() => {
    if (!pub || !trace) return "";
    return [
      `Date souhaitée : ${date}`,
      `Départ : ${(trace.base as { name?: string })?.name ?? "—"}`,
      `Carrière sélectionnée : ${(trace.pickup as { name?: string })?.name ?? "—"}`,
      `Distance garage → carrière : ${nb(d.base_to_pickup_km)} km`,
      `Distance carrière → client : ${nb(d.pickup_to_client_km)} km`,
      `Distance client → garage : ${nb(d.client_to_base_km)} km`,
      `Temps Google Maps : ${nb((t.travel_base_to_pickup_minutes ?? 0) + (t.travel_to_minutes ?? 0) + (t.travel_back_minutes ?? 0), 0)} min`,
      `Chargement : ${nb(t.loading_minutes, 0)} min`,
      `Déchargement : ${nb(t.unloading_minutes, 0)} min`,
      `Temps tampon : ${nb(t.buffer_minutes, 0)} min`,
      `Temps total (avant minimum/arrondi) : ${nb(t.raw_trip_minutes, 0)} min`,
      `Temps minimum appliqué : ${minApplied ? "Oui" : "Non"}`,
      `Temps facturable par voyage : ${nb(t.billable_trip_minutes, 0)} min`,
      `Camion recommandé : ${pub.truck.name ?? "—"} (${nb(pub.truck.capacity_tonnes, 1)} t)`,
      `Voyages : ${pub.trips}`,
      `Temps facturable total : ${nb(t.billable_hours, 3)} h`,
      `Prix matériau : ${money(pub.material_amount)}`,
      `Prix transport : ${money(pub.transport_amount)}`,
      `Sous-total : ${money(pub.subtotal)}`,
      ...pub.taxes.map((x) => `${x.name} (${x.rate_percent} %) : ${money(x.amount)}`),
      `Total livré : ${money(pub.total)}`,
    ].join("\n");
  }, [pub, trace, d, t, minApplied, date]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Validation des soumissions</h2>
        <p className="text-sm text-muted-foreground">
          Outil interne de vérification : simule une soumission complète et affiche chaque étape du calcul.
          Aucun calcul n'est effectué ici — tout provient du moteur officiel.
        </p>
      </div>

      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Matériau</Label>
          <Select value={materialId} onValueChange={setMaterialId}>
            <SelectTrigger><SelectValue placeholder="Choisir un matériau…" /></SelectTrigger>
            <SelectContent>
              {materials.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Quantité</Label>
          <div className="flex gap-2">
            <Input type="number" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            <Select value={unit} onValueChange={(v) => setUnit(v as QuoteUnit)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tonne">tonnes</SelectItem>
                <SelectItem value="verge">verges</SelectItem>
                <SelectItem value="m3">m³</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Adresse de livraison</Label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 rue Principale, Québec" />
        </div>
        <div className="space-y-1.5">
          <Label>Date souhaitée</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Button onClick={run} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ClipboardList className="mr-2 h-4 w-4" />}
            Simuler la soumission
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <span>{error}</span>
        </div>
      )}

      {pub && trace && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="rounded-lg border p-4">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Trajet</h3>
              <Row label="Point de départ (garage)" value={String((trace.base as { name?: string })?.name ?? "—")} />
              <Row label="Carrière choisie" value={String((trace.pickup as { name?: string })?.name ?? "—")} />
              <Row label="Distance garage → carrière" value={`${nb(d.base_to_pickup_km)} km`} />
              <Row label="Distance aller (carrière → client)" value={`${nb(d.pickup_to_client_km)} km`} />
              <Row label="Distance retour (client → garage)" value={`${nb(d.client_to_base_km)} km`} />
            </div>
            <div className="rounded-lg border p-4">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Temps</h3>
              <Row label="Temps Google Maps (déplacements)" value={`${nb((t.travel_base_to_pickup_minutes ?? 0) + (t.travel_to_minutes ?? 0) + (t.travel_back_minutes ?? 0), 0)} min`} />
              <Row label="Temps de chargement" value={`${nb(t.loading_minutes, 0)} min`} />
              <Row label="Temps de déchargement" value={`${nb(t.unloading_minutes, 0)} min`} />
              <Row label="Temps tampon" value={`${nb(t.buffer_minutes, 0)} min`} />
              <Row label="Temps total calculé (par voyage)" value={`${nb(t.raw_trip_minutes, 0)} min`} />
              <Row label="Temps minimum appliqué" value={minApplied ? `Oui (${nb(t.floored_trip_minutes, 0)} min)` : "Non"} />
              <Row label="Temps facturable par voyage" value={`${nb(t.billable_trip_minutes, 0)} min`} />
              <Row label="Temps facturable final" value={`${nb(t.billable_hours, 3)} h (${nb(t.billable_minutes, 0)} min)`} />
            </div>
            <div className="rounded-lg border p-4">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Camion</h3>
              <Row label="Camion choisi" value={pub.truck.name ?? "—"} />
              <Row label="Capacité du camion" value={`${nb(pub.truck.capacity_tonnes, 1)} t`} />
              <Row label="Tarif horaire" value={money((trace.truck as { hourly_rate?: number })?.hourly_rate)} />
              <Row label="Tonnage à livrer" value={`${nb(pub.tonnage, 3)} t`} />
              <Row label="Nombre de voyages" value={String(pub.trips)} />
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border p-4">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Montants</h3>
              <Row label="Prix du matériau" value={money(pub.material_amount)} />
              <Row label="Prix du transport" value={money(pub.transport_amount)} />
              <Row label="Sous-total" value={money(pub.subtotal)} />
              {pub.taxes.map((x) => (
                <Row key={x.code ?? x.name} label={`${x.name} (${x.rate_percent} %)`} value={money(x.amount)} />
              ))}
              <Row label="Total livré" value={money(pub.total)} />
            </div>

            <div className="rounded-lg border p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Journal de calcul</h3>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { void navigator.clipboard.writeText(journal); toast.success("Journal copié."); }}
                >
                  <Copy className="mr-1.5 h-4 w-4" /> Copier
                </Button>
              </div>
              <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs leading-relaxed">
                {journal}
              </pre>
              {meta && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Moteur {meta.version} — calculé le {new Date(meta.at).toLocaleString("fr-CA")}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}