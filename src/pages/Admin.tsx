import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { MATERIAL_TYPES } from "@/lib/questionnaire-data";
import { Truck, LogOut, Trash2, Loader2, ChevronDown, ChevronUp, Map, List } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import AdminMap from "@/components/AdminMap";

interface Submission {
  id: string;
  submission_number: number | null;
  latitude: number | null;
  longitude: number | null;
  materials: string[];
  other_material: string | null;
  property_type: string;
  quantity: string;
  tonnage: string;
  budget_unit: string | null;
  budget_max: string | null;
  machinery_available: boolean | null;
  machinery_description: string | null;
  accessibility: string[] | null;
  address: string;
  postal_code: string | null;
  name: string;
  email: string;
  phone: string | null;
  description: string | null;
  created_at: string;
}

const Admin = () => {
  const [user, setUser] = useState<User | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "map">("map");
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/login");
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        navigate("/login");
      } else {
        setUser(session.user);
        fetchSubmissions();
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchSubmissions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("submissions")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger les demandes.", variant: "destructive" });
    } else {
      setSubmissions(data || []);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("submissions").delete().eq("id", id);
    if (error) {
      toast({ title: "Erreur", description: "Impossible de supprimer.", variant: "destructive" });
    } else {
      setSubmissions((prev) => prev.filter((s) => s.id !== id));
      toast({ title: "Supprimée", description: "Demande supprimée." });
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const getMaterialLabels = (ids: string[]) =>
    ids.map((id) => MATERIAL_TYPES.find((m) => m.id === id)?.label || id).join(", ");

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="w-6 h-6 text-primary" />
            <span className="font-display font-bold text-xl text-foreground">
              Vrac<span className="text-primary">Québec</span>
            </span>
            <span className="ml-2 px-2 py-0.5 rounded text-xs bg-primary/10 text-primary font-display font-semibold">Admin</span>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors font-body">
            <LogOut className="w-4 h-4" /> Déconnexion
          </button>
        </div>
      </nav>

      <main className="container mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
            Demandes reçues
          </h1>
          <div className="flex items-center gap-3">
            <div className="flex bg-secondary rounded-lg p-0.5">
              <button
                onClick={() => setView("map")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-display font-semibold transition-colors ${
                  view === "map" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Map className="w-4 h-4" /> Carte
              </button>
              <button
                onClick={() => setView("list")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-display font-semibold transition-colors ${
                  view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <List className="w-4 h-4" /> Liste
              </button>
            </div>
            <button onClick={fetchSubmissions} className="text-sm text-primary hover:underline font-body">
              Actualiser
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : view === "map" ? (
          <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
            <AdminMap submissions={submissions} />
          </Suspense>
        ) : submissions.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground font-body">Aucune demande pour le moment.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {submissions.map((sub) => (
              <div key={sub.id} className="bg-card rounded-xl border border-border overflow-hidden" style={{ boxShadow: "var(--shadow-sm)" }}>
                <button
                  onClick={() => setExpanded(expanded === sub.id ? null : sub.id)}
                  className="w-full px-5 py-4 flex items-center justify-between text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-display font-bold text-foreground">{sub.name}</span>
                      <span className="text-xs text-muted-foreground font-body">{formatDate(sub.created_at)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground font-body mt-0.5 truncate">
                      {getMaterialLabels(sub.materials)} • {sub.address}
                    </p>
                  </div>
                  {expanded === sub.id ? (
                    <ChevronUp className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  )}
                </button>

                {expanded === sub.id && (
                  <div className="px-5 pb-5 border-t border-border pt-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm font-body">
                      <Detail label="Matériaux" value={getMaterialLabels(sub.materials)} />
                      {sub.other_material && <Detail label="Autre matériel" value={sub.other_material} />}
                      <Detail label="Type de propriété" value={sub.property_type} />
                      <Detail label="Voyages" value={sub.quantity} />
                      <Detail label="Tonnage" value={sub.tonnage} />
                      {sub.budget_unit && <Detail label="Budget" value={`${sub.budget_max || ""} ${sub.budget_unit}`} />}
                      <Detail label="Machinerie" value={sub.machinery_available ? `Oui — ${sub.machinery_description || ""}` : "Non"} />
                      {sub.accessibility && sub.accessibility.length > 0 && (
                        <Detail label="Accessibilité" value={sub.accessibility.join(", ")} />
                      )}
                      <Detail label="Adresse" value={`${sub.address}${sub.postal_code ? `, ${sub.postal_code}` : ""}`} />
                      <Detail label="Courriel" value={sub.email} />
                      {sub.phone && <Detail label="Téléphone" value={sub.phone} />}
                      {sub.description && <Detail label="Notes" value={sub.description} />}
                    </div>
                    <div className="mt-4 flex justify-end">
                      <button
                        onClick={() => handleDelete(sub.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-destructive hover:bg-destructive/10 transition-colors font-display font-semibold"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Supprimer
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

const Detail = ({ label, value }: { label: string; value: string }) => (
  <div>
    <span className="text-muted-foreground">{label}:</span>{" "}
    <span className="text-foreground font-medium">{value}</span>
  </div>
);

export default Admin;
