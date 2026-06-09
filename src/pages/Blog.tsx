import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Truck, ArrowLeft } from "lucide-react";
import TransportBanner from "@/components/TransportBanner";

export default function Blog() {
  useEffect(() => {
    const id = "soro-embed-script";
    if (document.getElementById(id)) return;
    const s = document.createElement("script");
    s.id = id;
    s.src = "https://app.trysoro.com/api/embed/a178cb03-99b1-400b-9673-81155ca964c8?theme=dark";
    s.defer = true;
    document.body.appendChild(s);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Truck className="w-6 h-6 text-primary" />
            <span className="font-display font-bold text-xl text-foreground">
              Vrac<span className="text-primary">Québec</span>
            </span>
          </Link>
          <Link to="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground font-body">
            <ArrowLeft className="w-4 h-4" /> Accueil
          </Link>
        </div>
      </nav>
      <main className="container mx-auto px-4 sm:px-6 py-10">
        <header className="mb-8 max-w-3xl">
          <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-3">Blogue Vrac Québec</h1>
          <p className="text-muted-foreground font-body">Guides, conseils et actualités sur le transport en vrac, le remblai et la livraison de matériaux au Québec.</p>
        </header>
        <div id="soro-blog" />
      </main>
    </div>
  );
}
