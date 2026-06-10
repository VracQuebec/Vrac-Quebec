import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface LeadStatus {
  id: string;
  value: string;
  label: string;
  color: string;        // background color (hex)
  text_color: string;   // text color (hex)
  sort_order: number;
  enabled: boolean;
}

/** Fallback used while the DB hasn't loaded yet, so badges still render. */
const FALLBACK: LeadStatus[] = [
  { id: "_fb_nouveau", value: "nouveau", label: "Nouveau", color: "#7ED321", text_color: "#111111", sort_order: 10, enabled: true },
];

export const useLeadStatuses = () => {
  const [statuses, setStatuses] = useState<LeadStatus[]>(FALLBACK);
  const [loading, setLoading] = useState(true);

  const fetchStatuses = useCallback(async () => {
    const { data, error } = await supabase
      .from("lead_statuses")
      .select("*")
      .order("sort_order", { ascending: true });
    if (!error && data) setStatuses(data as LeadStatus[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchStatuses(); }, [fetchStatuses]);

  return { statuses, loading, refresh: fetchStatuses };
};

/** Look up a status by stored value, including legacy/disabled ones. */
export const findStatus = (statuses: LeadStatus[], value: string): LeadStatus => {
  return (
    statuses.find((s) => s.value === value) ||
    statuses[0] || {
      id: "_unknown",
      value,
      label: value || "—",
      color: "#64748b",
      text_color: "#ffffff",
      sort_order: 0,
      enabled: true,
    }
  );
};