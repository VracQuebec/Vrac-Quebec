// Journal d'audit : qui a fait quoi, quand, avec l'ancienne et la nouvelle valeur.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

type AuditRow = {
  id: string;
  table_name: string;
  record_id: string | null;
  record_label: string | null;
  action: string;
  actor_email: string | null;
  actor_id: string | null;
  changed_fields: string[] | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
};

const ACTION_LABELS: Record<string, string> = {
  insert: "Création",
  update: "Modification",
  delete: "Suppression",
  archive: "Archivage",
  restore: "Restauration",
};

function fmt(v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default function AuditTrail({
  recordId,
  tableName,
  limit = 200,
}: {
  recordId?: string;
  tableName?: string;
  limit?: number;
}) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("jsc_audit_log").select("*").order("created_at", { ascending: false }).limit(limit);
    if (recordId) q = q.eq("record_id", recordId);
    if (tableName) q = q.eq("table_name", tableName);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setRows((data as unknown as AuditRow[]) ?? []);
    setLoading(false);
  }, [recordId, tableName, limit]);

  useEffect(() => { void load(); }, [load]);

  const filtered = rows.filter((r) => {
    const s = query.trim().toLowerCase();
    if (!s) return true;
    return [r.table_name, r.record_label, r.actor_email, r.action]
      .some((v) => String(v ?? "").toLowerCase().includes(s));
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement de l'historique…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!recordId && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Rechercher par module, élément ou utilisateur…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Aucune action enregistrée.</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => (
            <li key={r.id} className="rounded-lg border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant={r.action === "delete" ? "destructive" : "secondary"}>
                  {ACTION_LABELS[r.action] ?? r.action}
                </Badge>
                {!recordId && <span className="font-medium">{r.record_label ?? r.table_name}</span>}
                <span className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString("fr-CA")} · {r.actor_email ?? r.actor_id ?? "système"}
                </span>
              </div>
              {(r.changed_fields?.length ?? 0) > 0 && r.action !== "insert" && (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="py-1 pr-3 text-left font-medium">Champ</th>
                        <th className="py-1 pr-3 text-left font-medium">Ancienne valeur</th>
                        <th className="py-1 text-left font-medium">Nouvelle valeur</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.changed_fields!.map((f) => (
                        <tr key={f} className="border-t">
                          <td className="py-1 pr-3 font-mono">{f}</td>
                          <td className="py-1 pr-3 text-muted-foreground">{fmt(r.old_values?.[f])}</td>
                          <td className="py-1 font-medium">{fmt(r.new_values?.[f])}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}