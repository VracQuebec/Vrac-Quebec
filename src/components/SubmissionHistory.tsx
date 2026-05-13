import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { History, Loader2 } from "lucide-react";

interface AuditEntry {
  id: string;
  field_key: string;
  field_label: string | null;
  old_value: any;
  new_value: any;
  user_email: string | null;
  changed_at: string;
}

const FIELD_LABELS: Record<string, string> = {
  name: "Nom", email: "Courriel", phone: "Téléphone", address: "Adresse",
  postal_code: "Code postal", materials: "Matériaux", other_material: "Autre matériau",
  property_type: "Type de projet", quantity: "Voyages", tonnage: "Tonnage",
  deliver_or_remove: "Livrer/Sortir", contamination: "Contamination",
  budget_max: "Budget max", budget_unit: "Unité budget",
  machinery_available: "Machinerie", machinery_description: "Description machinerie",
  accessibility: "Accessibilité", length_ft: "Longueur", width_ft: "Largeur", depth_in: "Profondeur",
  delivery_deadline: "Date limite", delivery_timeframe: "Délai souhaité",
  description: "Notes client", internal_notes: "Notes internes",
  status: "Statut", priority: "Priorité", request_type: "Type de demande",
  visible_to_entrepreneur: "Visible entrepreneur", assigned_entrepreneur: "Entrepreneur assigné",
  photos: "Photos",
};

const fmtVal = (v: any): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Oui" : "Non";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

const fmtDate = (d: string) =>
  new Date(d).toLocaleString("fr-CA", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

const labelFor = (entry: AuditEntry) => {
  if (entry.field_key.startsWith("custom:")) return entry.field_label || entry.field_key.slice(7);
  return FIELD_LABELS[entry.field_key] || entry.field_label || entry.field_key;
};

export const SubmissionHistory = ({ submissionId }: { submissionId: string }) => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    supabase
      .from("submission_audit_log")
      .select("*")
      .eq("submission_id", submissionId)
      .order("changed_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (!active) return;
        setEntries((data as any) || []);
        setLoading(false);
      });
    return () => { active = false; };
  }, [submissionId]);

  return (
    <div className="bg-secondary/30 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <History className="w-3.5 h-3.5 text-muted-foreground" />
        <div className="text-[10px] uppercase tracking-wide font-display font-bold text-muted-foreground">Historique des modifications</div>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-4 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /></div>
      ) : entries.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Aucune modification enregistrée pour cette fiche.</p>
      ) : (
        <div className="space-y-1.5 max-h-72 overflow-auto">
          {entries.map((e) => (
            <div key={e.id} className="text-xs bg-background/60 rounded p-2 border border-border/50">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-0.5">
                <span className="font-display font-bold text-foreground">{labelFor(e)}</span>
                <span className="text-[10px] text-muted-foreground">
                  {fmtDate(e.changed_at)}{e.user_email ? ` • ${e.user_email}` : ""}
                </span>
              </div>
              <div className="font-body text-muted-foreground">
                <span className="line-through opacity-60">{fmtVal(e.old_value)}</span>
                <span className="mx-1.5">→</span>
                <span className="text-foreground font-medium">{fmtVal(e.new_value)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SubmissionHistory;