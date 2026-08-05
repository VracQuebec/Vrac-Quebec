// ============================================================
// APPROVISIONNEMENT — vérification matériau ↔ carrière assignée
// Lecture seule : montre exactement ce que le moteur utilisera.
// Aucune règle « fournisseur le moins cher » : la carrière est
// toujours celle assignée au matériau dans l'onglet Matériaux.
// ============================================================
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Row = {
  material_id: string;
  material_name: string;
  material_slug: string | null;
  pickup_name: string | null;
  supplier_name: string | null;
  supplier_type: string | null;
  price_per_tonne: number | null;
  is_ready: boolean | null;
  issues: string[] | null;
};

const ISSUE_LABELS: Record<string, string> = {
  carriere_non_assignee: "Aucune carrière assignée",
  coordonnees_manquantes: "Coordonnées GPS manquantes",
  carriere_inactive: "Carrière inactive",
  prix_tonne_manquant: "Prix à la tonne manquant",
  fournisseur_non_renseigne: "Fournisseur non renseigné",
};

const TYPE_LABELS: Record<string, string> = {
  carriere: "Carrière", sabliere: "Sablière", depot: "Dépôt",
  recyclage: "Recyclage", garage: "Garage", autre: "Autre",
};

export default function SupplyMatrix() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.rpc("jsc_supply_readiness");
    setRows((data ?? []) as Row[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const blocking = rows.filter((r) => !r.is_ready).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Approvisionnement</h2>
          <p className="text-sm text-muted-foreground">
            Chaque matériau utilise toujours la carrière qui lui est assignée. Cette vue montre les
            données exactes que le moteur de soumission utilisera.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualiser
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement…
        </div>
      ) : (
        <>
          <div className="rounded-lg border p-4 text-sm">
            {blocking === 0 ? (
              <span className="inline-flex items-center gap-2 text-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                {rows.length} matériaux actifs, tous prêts pour le calcul.
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 text-foreground">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                {blocking} matériau(x) incomplet(s) sur {rows.length}.
              </span>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Matériau</th>
                  <th className="px-3 py-2">Carrière assignée</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Fournisseur</th>
                  <th className="px-3 py-2 text-right">Prix / tonne</th>
                  <th className="px-3 py-2">État</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.material_id}>
                    <td className="px-3 py-2 font-medium">{r.material_name}</td>
                    <td className="px-3 py-2">{r.pickup_name ?? "—"}</td>
                    <td className="px-3 py-2">{TYPE_LABELS[r.supplier_type ?? ""] ?? r.supplier_type ?? "—"}</td>
                    <td className="px-3 py-2">{r.supplier_name ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {r.price_per_tonne != null ? `${Number(r.price_per_tonne).toFixed(2)} $` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {r.is_ready ? (
                        <Badge variant="secondary">Prêt</Badge>
                      ) : (
                        <Badge variant="destructive">À compléter</Badge>
                      )}
                      {(r.issues ?? []).length > 0 && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {(r.issues ?? []).map((i) => ISSUE_LABELS[i] ?? i).join(" · ")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}