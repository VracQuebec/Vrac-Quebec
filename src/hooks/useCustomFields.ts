import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CustomFieldType = "text" | "number" | "date" | "boolean" | "select" | "multiselect" | "textarea";

export interface CustomField {
  id: string;
  key: string;
  label: string;
  field_type: CustomFieldType;
  options: string[];
  sort_order: number;
}

export const useCustomFields = () => {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("custom_fields")
      .select("*")
      .order("sort_order", { ascending: true });
    setFields(((data as any) || []).map((f: any) => ({ ...f, options: Array.isArray(f.options) ? f.options : [] })));
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { fields, loading, refresh };
};