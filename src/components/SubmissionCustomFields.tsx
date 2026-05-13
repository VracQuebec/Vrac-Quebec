import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCustomFields, type CustomField } from "@/hooks/useCustomFields";
import InlineField from "@/components/InlineField";
import { Link } from "react-router-dom";
import { Settings } from "lucide-react";

interface Props { submissionId: string }

export const SubmissionCustomFields = ({ submissionId }: Props) => {
  const { fields } = useCustomFields();
  const [values, setValues] = useState<Record<string, any>>({});

  useEffect(() => {
    let active = true;
    supabase
      .from("submission_custom_values")
      .select("field_id,value")
      .eq("submission_id", submissionId)
      .then(({ data }) => {
        if (!active) return;
        const map: Record<string, any> = {};
        ((data as any) || []).forEach((r: any) => { map[r.field_id] = r.value; });
        setValues(map);
      });
    return () => { active = false; };
  }, [submissionId]);

  const save = async (field: CustomField, raw: any) => {
    const value = raw === "" || raw === null || raw === undefined ? null : raw;
    setValues((prev) => ({ ...prev, [field.id]: value }));
    if (value === null) {
      await supabase.from("submission_custom_values").delete()
        .eq("submission_id", submissionId).eq("field_id", field.id);
    } else {
      await supabase.from("submission_custom_values").upsert({
        submission_id: submissionId,
        field_id: field.id,
        value,
      }, { onConflict: "submission_id,field_id" });
    }
  };

  return (
    <div className="bg-secondary/30 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wide font-display font-bold text-muted-foreground">Champs personnalisés</div>
        <Link to="/admin/champs" className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground font-display font-semibold">
          <Settings className="w-3 h-3" /> Gérer
        </Link>
      </div>
      {fields.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          Aucun champ personnalisé. <Link to="/admin/champs" className="underline">Créer un champ →</Link>
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {fields.map((f) => {
            const v = values[f.id];
            const common = { label: f.label, onSave: (val: any) => save(f, val) };
            if (f.field_type === "textarea")
              return <InlineField key={f.id} {...common} type="textarea" value={(v ?? "") as string} />;
            if (f.field_type === "number")
              return <InlineField key={f.id} {...common} type="number" value={(v ?? "") as string} />;
            if (f.field_type === "date")
              return <InlineField key={f.id} {...common} type="date" value={(v ?? "") as string} />;
            if (f.field_type === "boolean")
              return <InlineField key={f.id} {...common} type="boolean" value={!!v} />;
            if (f.field_type === "select")
              return <InlineField key={f.id} {...common} type="select" allowEmpty value={(v ?? "") as string}
                options={(f.options || []).map((o) => ({ value: o, label: o }))} />;
            if (f.field_type === "multiselect")
              return <InlineField key={f.id} {...common} type="multiselect" value={Array.isArray(v) ? v : []}
                options={(f.options || []).map((o) => ({ value: o, label: o }))} />;
            return <InlineField key={f.id} {...common} type="text" value={(v ?? "") as string} />;
          })}
        </div>
      )}
    </div>
  );
};

export default SubmissionCustomFields;