import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Calculator, Boxes, Ruler, Truck, DollarSign } from "lucide-react";
import BlogNav from "@/components/blog/BlogNav";
import BlogFooterCTA from "@/components/blog/BlogFooterCTA";
import Breadcrumbs from "@/components/blog/Breadcrumbs";
import { SITE_URL } from "@/lib/blog/utils";

const TOOLS = [
  { slug: "tonnage", title: "Calculateur de tonnage", desc: "Convertissez volume en tonnes selon le matériau.", icon: Calculator, color: "#7ED321" },
  { slug: "verges-cubes", title: "Calculateur de verges cubes", desc: "Passez des dimensions en verges cubes (yd³).", icon: Boxes, color: "#8B5CF6" },
  { slug: "volume", title: "Calculateur de volume", desc: "Volume en m³ à partir de longueur, largeur, profondeur.", icon: Ruler, color: "#10B981" },
  { slug: "voyages-camion", title: "Calculateur de voyages de camion", desc: "Nombre de voyages selon capacité et matériau.", icon: Truck, color: "#F59E0B" },
  { slug: "cout-transport", title: "Calculateur de coût de transport", desc: "Estimez le coût par distance et par voyage.", icon: DollarSign, color: "#EC4899" },
];

export default function BlogTools() {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Outils gratuits — Calculateurs vrac Québec</title>
        <meta name="description" content="Calculateurs gratuits de tonnage, verges cubes, volume, voyages de camion et coût de transport pour vos projets de remblai, terre, sable et gravier." />
        <link rel="canonical" href={`${SITE_URL}/blog/outils`} />
      </Helmet>
      <BlogNav />
      <div className="container mx-auto px-4 sm:px-6 pt-6">
        <Breadcrumbs items={[{ label: "Blogue", to: "/blog" }, { label: "Outils gratuits" }]} />
      </div>
      <header className="container mx-auto px-4 sm:px-6 pt-8 pb-6 max-w-3xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/15 text-primary text-xs uppercase tracking-widest font-display font-bold mb-4">
          <Calculator className="w-3.5 h-3.5" /> Outils gratuits
        </div>
        <h1 className="text-3xl md:text-5xl font-display font-extrabold text-foreground leading-tight">
          Calculez vos besoins <span className="text-primary">en un clic</span>
        </h1>
        <p className="mt-4 text-muted-foreground font-body">
          Utilisez nos calculateurs gratuits pour estimer rapidement votre projet — tonnage, volume, nombre de voyages et coût de transport.
        </p>
      </header>
      <main className="container mx-auto px-4 sm:px-6 pb-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {TOOLS.map((t) => {
            const Icon = t.icon;
            return (
              <Link
                key={t.slug}
                to={`/blog/outils/${t.slug}`}
                className="group rounded-2xl border border-border bg-card p-6 hover:shadow-lg transition"
              >
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl text-white mb-4" style={{ backgroundColor: t.color }}>
                  <Icon className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-display font-extrabold text-foreground group-hover:text-primary transition">{t.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground font-body">{t.desc}</p>
              </Link>
            );
          })}
        </div>
        <BlogFooterCTA />
      </main>
    </div>
  );
}