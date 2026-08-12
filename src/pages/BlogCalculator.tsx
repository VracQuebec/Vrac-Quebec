import { useMemo, useState } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import BlogNav from "@/components/blog/BlogNav";
import BlogFooterCTA from "@/components/blog/BlogFooterCTA";
import Breadcrumbs from "@/components/blog/Breadcrumbs";
import { SITE_URL } from "@/lib/blog/utils";
import { Calculator } from "lucide-react";
// Densités et capacités : uniquement les données réelles de l'administration
// (jsc_materials / jsc_trucks). Aucune valeur inventée ici.
import { M3_TO_YD3, tripsFor, useCalcMaterials } from "@/lib/vrac/calculator";
import { usePublicTrucks } from "@/lib/vrac/units";
import { truckTypeDef } from "@/lib/trucks/catalog";

type Tool = "tonnage" | "verges-cubes" | "volume" | "voyages-camion" | "cout-transport";

const META: Record<Tool, { title: string; desc: string }> = {
  "tonnage": { title: "Calculateur de tonnage", desc: "Calculez le tonnage nécessaire selon les dimensions et le type de matériau." },
  "verges-cubes": { title: "Calculateur de verges cubes", desc: "Convertissez longueur, largeur et profondeur en verges cubes (yd³)." },
  "volume": { title: "Calculateur de volume (m³)", desc: "Estimez le volume en mètres cubes à partir des dimensions du projet." },
  "voyages-camion": { title: "Calculateur de voyages de camion", desc: "Estimez le nombre de voyages de camion selon la capacité et le volume." },
  "cout-transport": { title: "Calculateur de coût de transport", desc: "Estimez le coût de transport en fonction de la distance et du nombre de voyages." },
};

export default function BlogCalculator() {
  const { tool = "" } = useParams();
  const t = tool as Tool;
  if (!META[t]) return <Navigate to="/blog/outils" replace />;

  const url = `${SITE_URL}/blog/outils/${t}`;

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{META[t].title} — Vrac Québec</title>
        <meta name="description" content={META[t].desc} />
        <link rel="canonical" href={url} />
      </Helmet>
      <BlogNav />
      <div className="container mx-auto px-4 sm:px-6 pt-6">
        <Breadcrumbs items={[
          { label: "Blogue", to: "/blog" },
          { label: "Outils gratuits", to: "/blog/outils" },
          { label: META[t].title },
        ]} />
      </div>
      <header className="container mx-auto px-4 sm:px-6 pt-8 pb-6 max-w-3xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/15 text-primary text-xs uppercase tracking-widest font-display font-bold mb-4">
          <Calculator className="w-3.5 h-3.5" /> Outil gratuit
        </div>
        <h1 className="text-3xl md:text-4xl font-display font-extrabold text-foreground leading-tight">{META[t].title}</h1>
        <p className="mt-3 text-muted-foreground font-body">{META[t].desc}</p>
      </header>
      <main className="container mx-auto px-4 sm:px-6 pb-12 max-w-3xl">
        <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
          {t === "tonnage" && <Tonnage />}
          {t === "verges-cubes" && <YardsCubes />}
          {t === "volume" && <Volume />}
          {t === "voyages-camion" && <Trips />}
          {t === "cout-transport" && <Cost />}
        </div>
        <div className="mt-6 text-xs text-muted-foreground font-body">
          Les résultats sont donnés à titre indicatif. Pour une estimation précise, <Link to="/#questionnaire" className="text-primary underline">demandez une soumission</Link>.
        </div>
        <BlogFooterCTA />
      </main>
    </div>
  );
}

function NumberField({ label, unit, value, onChange, step = 0.1 }: { label: string; unit?: string; value: string; onChange: (v: string) => void; step?: number }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wider font-display font-bold text-muted-foreground mb-2">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background font-body text-base"
        />
        {unit && <span className="text-sm text-muted-foreground font-body">{unit}</span>}
      </div>
    </label>
  );
}

function Result({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-xl bg-primary/10 border border-primary/30 p-5">
      <div className="text-xs uppercase tracking-wider font-display font-bold text-primary mb-2">Résultat</div>
      <div className="text-2xl md:text-3xl font-display font-extrabold text-foreground">{children}</div>
    </div>
  );
}

function MaterialSelect({
  value, onChange, materials, loading,
}: {
  value: string;
  onChange: (v: string) => void;
  materials: { slug: string; name: string; density_kg_per_m3: number }[];
  loading: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wider font-display font-bold text-muted-foreground mb-2">Type de matériau</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-border bg-background font-body text-base"
      >
        <option value="">{loading ? "Chargement…" : "Choisir un matériau"}</option>
        {materials.map((m) => (
          <option key={m.slug} value={m.slug}>
            {m.name} ({(m.density_kg_per_m3 / 1000).toFixed(2)} t/m³)
          </option>
        ))}
      </select>
    </label>
  );
}

function Volume() {
  const [l, setL] = useState("10");
  const [w, setW] = useState("5");
  const [d, setD] = useState("0.3");
  const m3 = useMemo(() => Number(l) * Number(w) * Number(d), [l, w, d]);
  return (
    <div className="grid gap-4">
      <div className="grid sm:grid-cols-3 gap-4">
        <NumberField label="Longueur" unit="m" value={l} onChange={setL} />
        <NumberField label="Largeur" unit="m" value={w} onChange={setW} />
        <NumberField label="Profondeur" unit="m" value={d} onChange={setD} step={0.05} />
      </div>
      <Result>{isFinite(m3) ? m3.toFixed(2) : "—"} m³ &nbsp;<span className="text-base text-muted-foreground font-body">({(m3 * M3_TO_YD3).toFixed(2)} yd³)</span></Result>
    </div>
  );
}

function YardsCubes() {
  const [l, setL] = useState("10");
  const [w, setW] = useState("5");
  const [d, setD] = useState("0.3");
  const m3 = Number(l) * Number(w) * Number(d);
  const yd3 = m3 * M3_TO_YD3;
  return (
    <div className="grid gap-4">
      <div className="grid sm:grid-cols-3 gap-4">
        <NumberField label="Longueur" unit="m" value={l} onChange={setL} />
        <NumberField label="Largeur" unit="m" value={w} onChange={setW} />
        <NumberField label="Profondeur" unit="m" value={d} onChange={setD} step={0.05} />
      </div>
      <Result>{isFinite(yd3) ? yd3.toFixed(2) : "—"} yd³ &nbsp;<span className="text-base text-muted-foreground font-body">({m3.toFixed(2)} m³)</span></Result>
    </div>
  );
}

function Tonnage() {
  const [l, setL] = useState("10");
  const [w, setW] = useState("5");
  const [d, setD] = useState("0.3");
  const [mat, setMat] = useState("");
  const { materials, loading } = useCalcMaterials();
  const m3 = Number(l) * Number(w) * Number(d);
  const density = materials.find((m) => m.slug === mat)?.density_kg_per_m3 ?? null;
  const tonnes = density ? (m3 * density) / 1000 : null;
  return (
    <div className="grid gap-4">
      <MaterialSelect value={mat} onChange={setMat} materials={materials} loading={loading} />
      <div className="grid sm:grid-cols-3 gap-4">
        <NumberField label="Longueur" unit="m" value={l} onChange={setL} />
        <NumberField label="Largeur" unit="m" value={w} onChange={setW} />
        <NumberField label="Profondeur" unit="m" value={d} onChange={setD} step={0.05} />
      </div>
      <Result>
        {tonnes && isFinite(tonnes) ? `${tonnes.toFixed(2)} tonnes` : "—"} &nbsp;
        <span className="text-base text-muted-foreground font-body">({isFinite(m3) ? m3.toFixed(2) : "—"} m³)</span>
      </Result>
      <p className="text-xs text-muted-foreground font-body">
        {density
          ? "Poids estimatif : le poids réel varie selon la granulométrie, l'humidité et la compaction du matériau."
          : "Choisissez un matériau pour convertir le volume calculé en poids estimatif."}
      </p>
    </div>
  );
}

/** Camions réellement configurés en administration, hors machinerie (fardier). */
function useBulkTrucks() {
  return usePublicTrucks().filter((t) => truckTypeDef(t.truck_type)?.bulk !== false);
}

function Trips() {
  const [tonnes, setTonnes] = useState("30");
  const trucks = useBulkTrucks();
  const qty = Number(tonnes);
  return (
    <div className="grid gap-4">
      <NumberField label="Quantité totale à transporter" unit="tonnes" value={tonnes} onChange={setTonnes} />
      {trucks.length > 0 ? (
        <div className="rounded-xl bg-primary/10 border border-primary/30 p-5 grid gap-2">
          <div className="text-xs uppercase tracking-wider font-display font-bold text-primary">Voyages estimés</div>
          {trucks.map((t) => {
            const trips = tripsFor(qty, t.capacity_tonnes);
            return (
              <div key={t.id} className="flex items-center justify-between gap-3 font-body text-sm text-foreground">
                <span>{t.name} <span className="text-muted-foreground">({t.capacity_tonnes} t max / voyage)</span></span>
                <strong className="font-display">{trips ?? "—"} voyage{(trips ?? 0) > 1 ? "s" : ""}</strong>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground font-body">
          Les capacités de camion ne sont pas encore publiées. Notre équipe confirme le nombre de voyages avec vous.
        </p>
      )}
      <p className="text-xs text-muted-foreground font-body">
        Estimation arrondie au voyage supérieur, selon les capacités réelles en tonnes de notre flotte.
      </p>
    </div>
  );
}

function Cost() {
  const [tonnes, setTonnes] = useState("30");
  const [rate, setRate] = useState("");
  const [distance, setDistance] = useState("25");
  const [speed, setSpeed] = useState("45");
  const [loadMin, setLoadMin] = useState("30");
  const trucks = useBulkTrucks();
  const [truckId, setTruckId] = useState("");
  const truck = trucks.find((t) => t.id === truckId) ?? trucks[0] ?? null;
  const trips = truck ? tripsFor(Number(tonnes), truck.capacity_tonnes) : null;
  const kmh = Number(speed);
  const hoursPerTrip = kmh > 0 ? (Number(distance) * 2) / kmh + Number(loadMin) / 60 : NaN;
  const cost = trips && Number(rate) > 0 && isFinite(hoursPerTrip) ? trips * hoursPerTrip * Number(rate) : null;
  return (
    <div className="grid gap-4">
      <label className="block">
        <span className="block text-xs uppercase tracking-wider font-display font-bold text-muted-foreground mb-2">Camion</span>
        <select
          value={truck?.id ?? ""}
          onChange={(e) => setTruckId(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background font-body text-base"
        >
          {trucks.length === 0 && <option value="">Capacités non publiées</option>}
          {trucks.map((t) => (
            <option key={t.id} value={t.id}>{t.name} — {t.capacity_tonnes} t / voyage</option>
          ))}
        </select>
      </label>
      <div className="grid sm:grid-cols-2 gap-4">
        <NumberField label="Quantité à transporter" unit="tonnes" value={tonnes} onChange={setTonnes} />
        <NumberField label="Distance (aller simple)" unit="km" value={distance} onChange={setDistance} />
        <NumberField label="Vitesse moyenne estimée" unit="km/h" value={speed} onChange={setSpeed} step={5} />
        <NumberField label="Temps de chargement / déchargement" unit="min" value={loadMin} onChange={setLoadMin} step={5} />
        <NumberField label="Taux horaire du camion" unit="$/h" value={rate} onChange={setRate} step={5} />
      </div>
      <Result>
        {cost !== null ? `~ ${cost.toFixed(0)} $` : "—"} &nbsp;
        <span className="text-base text-muted-foreground font-body">({trips ?? "—"} voyages)</span>
      </Result>
      <p className="text-xs text-muted-foreground font-body">
        {Number(rate) > 0
          ? "Estimation indicative uniquement, calculée à partir des valeurs que vous saisissez : ce n'est pas un prix confirmé. Le coût réel dépend du camion disponible, du trafic, des accès et de la région."
          : "Entrez le taux horaire de votre transporteur pour obtenir une estimation. Vrac Québec ne publie pas de taux horaire générique."}
      </p>
    </div>
  );
}