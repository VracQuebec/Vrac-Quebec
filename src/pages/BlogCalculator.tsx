import { useMemo, useState } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import BlogNav from "@/components/blog/BlogNav";
import BlogFooterCTA from "@/components/blog/BlogFooterCTA";
import Breadcrumbs from "@/components/blog/Breadcrumbs";
import { SITE_URL } from "@/lib/blog/utils";
import { Calculator } from "lucide-react";

// Densités approximatives (tonnes / m³) — sources: guides construction Québec
const DENSITIES: Record<string, { label: string; t_per_m3: number }> = {
  terre: { label: "Terre végétale", t_per_m3: 1.4 },
  remblai: { label: "Remblai / matériau de remplissage", t_per_m3: 1.7 },
  sable: { label: "Sable", t_per_m3: 1.6 },
  gravier: { label: "Gravier concassé (0-3/4 po)", t_per_m3: 1.8 },
  pierre: { label: "Pierre nette", t_per_m3: 1.55 },
  asphalte: { label: "Asphalte", t_per_m3: 2.3 },
  beton: { label: "Béton concassé", t_per_m3: 1.9 },
};

const M3_TO_YD3 = 1.30795;

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

function MaterialSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wider font-display font-bold text-muted-foreground mb-2">Type de matériau</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-border bg-background font-body text-base"
      >
        {Object.entries(DENSITIES).map(([k, v]) => (
          <option key={k} value={k}>{v.label} (~{v.t_per_m3} t/m³)</option>
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
  const [mat, setMat] = useState("gravier");
  const m3 = Number(l) * Number(w) * Number(d);
  const tonnes = m3 * (DENSITIES[mat]?.t_per_m3 ?? 1.6);
  return (
    <div className="grid gap-4">
      <MaterialSelect value={mat} onChange={setMat} />
      <div className="grid sm:grid-cols-3 gap-4">
        <NumberField label="Longueur" unit="m" value={l} onChange={setL} />
        <NumberField label="Largeur" unit="m" value={w} onChange={setW} />
        <NumberField label="Profondeur" unit="m" value={d} onChange={setD} step={0.05} />
      </div>
      <Result>{isFinite(tonnes) ? tonnes.toFixed(2) : "—"} tonnes &nbsp;<span className="text-base text-muted-foreground font-body">({m3.toFixed(2)} m³)</span></Result>
    </div>
  );
}

function Trips() {
  const [m3, setM3] = useState("30");
  const [cap, setCap] = useState("12");
  const trips = Math.ceil(Number(m3) / Math.max(0.1, Number(cap)));
  return (
    <div className="grid gap-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <NumberField label="Volume total à transporter" unit="m³" value={m3} onChange={setM3} />
        <NumberField label="Capacité par camion" unit="m³" value={cap} onChange={setCap} />
      </div>
      <Result>{isFinite(trips) ? trips : "—"} voyages</Result>
      <p className="text-xs text-muted-foreground font-body">Capacité type — 6 roues : 6-8 m³, 10 roues : 10-14 m³, semi-remorque : 20-25 m³.</p>
    </div>
  );
}

function Cost() {
  const [m3, setM3] = useState("30");
  const [cap, setCap] = useState("12");
  const [rate, setRate] = useState("140");
  const [distance, setDistance] = useState("25");
  const trips = Math.ceil(Number(m3) / Math.max(0.1, Number(cap)));
  const hoursPerTrip = (Number(distance) * 2) / 45 + 0.5; // ~45 km/h aller-retour + 30 min chargement
  const cost = trips * hoursPerTrip * Number(rate);
  return (
    <div className="grid gap-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <NumberField label="Volume à transporter" unit="m³" value={m3} onChange={setM3} />
        <NumberField label="Capacité par camion" unit="m³" value={cap} onChange={setCap} />
        <NumberField label="Distance (aller simple)" unit="km" value={distance} onChange={setDistance} />
        <NumberField label="Taux horaire du camion" unit="$/h" value={rate} onChange={setRate} step={5} />
      </div>
      <Result>~ {isFinite(cost) ? cost.toFixed(0) : "—"} $ &nbsp;<span className="text-base text-muted-foreground font-body">({trips} voyages)</span></Result>
      <p className="text-xs text-muted-foreground font-body">Estimation indicative. Le coût réel dépend du type de camion, du carburant, des accès et de la région.</p>
    </div>
  );
}