import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/useUserRole";
import { ArrowLeft, Loader2, Search } from "lucide-react";

type Tab = "entrepreneurs" | "payments" | "expenses";

export default function AdminData() {
  const [tab, setTab] = useState<Tab>("entrepreneurs");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const { isAdmin, loading: roleLoading } = useUserRoles();

  useEffect(() => {
    if (!roleLoading && !isAdmin) navigate("/login");
  }, [isAdmin, roleLoading, navigate]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.from(tab).select("*").order("created_at", { ascending: false }).limit(2000);
      setRows(data || []);
      setLoading(false);
    };
    load();
  }, [tab]);

  const filtered = rows.filter((r) => {
    if (!q) return true;
    const s = JSON.stringify(r).toLowerCase();
    return s.includes(q.toLowerCase());
  });

  const cols: Record<Tab, { key: string; label: string }[]> = {
    entrepreneurs: [
      { key: "name", label: "Nom" }, { key: "company", label: "Entreprise" },
      { key: "phone", label: "Téléphone" }, { key: "email", label: "Courriel" },
      { key: "address", label: "Adresse" }, { key: "truck_count", label: "Camions" },
      { key: "map_number", label: "Map #" },
    ],
    payments: [
      { key: "delivery_date", label: "Date" }, { key: "client_name", label: "Client" },
      { key: "map_point", label: "Map" }, { key: "material", label: "Matériel" },
      { key: "trips", label: "Voyages" }, { key: "price_sold", label: "Vendu $" },
      { key: "charged_to_entrepreneur", label: "Entrepr. $" }, { key: "total", label: "Total $" },
      { key: "client_invoiced", label: "Client facturé" },
    ],
    expenses: [
      { key: "category", label: "Catégorie" }, { key: "expense_date", label: "Date" },
      { key: "company", label: "Entreprise" }, { key: "invoice_number", label: "Facture #" },
      { key: "tps", label: "TPS" }, { key: "tvq", label: "TVQ" },
      { key: "amount_before_tax", label: "Avant tx" }, { key: "amount_total", label: "Total" },
    ],
  };

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border bg-card">
        <div className="container mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/admin" className="flex items-center gap-2 text-sm font-display font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Retour à l'admin
          </Link>
          <h1 className="font-display font-bold">Données importées</h1>
        </div>
      </nav>

      <main className="container mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-wrap items-center gap-2 mb-5">
          {(["entrepreneurs", "payments", "expenses"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-display font-semibold ${tab === t ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
              {t === "entrepreneurs" ? "Entrepreneurs" : t === "payments" ? "Paiements" : "Factures"}
            </button>
          ))}
          <div className="ml-auto relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…"
              className="pl-8 pr-3 py-2 text-sm rounded-lg border border-border bg-card font-body" />
          </div>
        </div>

        <div className="text-sm text-muted-foreground font-body mb-3">{filtered.length} ligne(s)</div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <div className="overflow-x-auto bg-card rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary">
                <tr>{cols[tab].map((c) => <th key={c.key} className="text-left px-3 py-2 font-display font-bold text-xs uppercase">{c.label}</th>)}</tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-secondary/50">
                    {cols[tab].map((c) => (
                      <td key={c.key} className="px-3 py-2 font-body">
                        {r[c.key] === null || r[c.key] === undefined || r[c.key] === "" ? <span className="text-muted-foreground">—</span> : Array.isArray(r[c.key]) ? r[c.key].join(", ") : String(r[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}