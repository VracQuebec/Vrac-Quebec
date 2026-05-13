import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useUserRoles } from "@/hooks/useUserRole";
import { useCustomFields, type CustomFieldType } from "@/hooks/useCustomFields";
import { ArrowLeft, Plus, Trash2, Save, Loader2 } from "lucide-react";

const FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: "text", label: "Texte court" },
  { value: "textarea", label: "Texte long" },
  { value: "number", label: "Nombre" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Oui / Non" },
  { value: "select", label: "Liste (1 choix)" },
  { value: "multiselect", label: "Liste (plusieurs choix)" },
];

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
   .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);

const AdminCustomFields = () => {
  const navigate = useNavigate();
  const { isAdmin, loading: roleLoading } = useUserRoles();
  const { fields, refresh } = useCustomFields();
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<CustomFieldType>("text");
  const [newOptions, setNewOptions] = useState("");

  useEffect(() => {
    if (!roleLoading && !isAdmin) navigate("/login", { replace: true });
  }, [isAdmin, roleLoading, navigate]);

  const create = async () => {
    if (!newLabel.trim()) return;
    const baseKey = slugify(newLabel) || `champ_${Date.now()}`;
    setCreating(true);
    const opts = (newType === "select" || newType === "multiselect")
      ? newOptions.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    const { error } = await supabase.from("custom_fields").insert({
      key: baseKey,
      label: newLabel.trim(),
      field_type: newType,
      options: opts,
      sort_order: fields.length * 10,
    });
    setCreating(false);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    setNewLabel(""); setNewOptions(""); setNewType("text");
    refresh();
  };

  const updateField = async (id: string, patch: any) => {
    const { error } = await supabase.from("custom_fields").update(patch).eq("id", id);
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    else refresh();
  };

  const remove = async (id: string, label: string) => {
    if (!confirm(`Supprimer le champ « ${label} » ? Toutes les valeurs associées seront effacées.`)) return;
    const { error } = await supabase.from("custom_fields").delete().eq("id", id);
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    else refresh();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> Retour à l'administration
        </Link>
        <h1 className="text-2xl font-display font-bold mb-1">Champs personnalisés</h1>
        <p className="text-sm text-muted-foreground mb-6">Crée tes propres champs pour enrichir chaque fiche client (tags, source du lead, n° de facture, etc.).</p>

        {/* Create */}
        <div className="bg-card border border-border rounded-xl p-4 mb-6">
          <div className="text-xs uppercase font-display font-bold text-muted-foreground mb-3">Nouveau champ</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Nom du champ"
              className="px-3 py-2 text-sm rounded-md border border-border bg-background font-body" />
            <select value={newType} onChange={(e) => setNewType(e.target.value as CustomFieldType)}
              className="px-3 py-2 text-sm rounded-md border border-border bg-background font-body">
              {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <button onClick={create} disabled={creating || !newLabel.trim()}
              className="flex items-center justify-center gap-1 px-3 py-2 rounded-md bg-foreground text-background text-sm font-display font-semibold disabled:opacity-40">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Créer
            </button>
          </div>
          {(newType === "select" || newType === "multiselect") && (
            <input value={newOptions} onChange={(e) => setNewOptions(e.target.value)}
              placeholder="Options séparées par des virgules (ex: Google, Facebook, Référence)"
              className="mt-3 w-full px-3 py-2 text-sm rounded-md border border-border bg-background font-body" />
          )}
        </div>

        {/* List */}
        <div className="space-y-2">
          {fields.length === 0 && (
            <p className="text-sm text-muted-foreground italic text-center py-8">Aucun champ personnalisé pour l'instant.</p>
          )}
          {fields.map((f) => (
            <FieldRow key={f.id} field={f} onUpdate={(p) => updateField(f.id, p)} onDelete={() => remove(f.id, f.label)} />
          ))}
        </div>
      </div>
    </div>
  );
};

const FieldRow = ({ field, onUpdate, onDelete }: { field: any; onUpdate: (p: any) => void; onDelete: () => void }) => {
  const [label, setLabel] = useState(field.label);
  const [opts, setOpts] = useState((field.options || []).join(", "));
  const [dirty, setDirty] = useState(false);

  useEffect(() => { setLabel(field.label); setOpts((field.options || []).join(", ")); setDirty(false); }, [field.id, field.label, field.options]);

  const save = () => {
    const patch: any = { label };
    if (field.field_type === "select" || field.field_type === "multiselect") {
      patch.options = opts.split(",").map((s: string) => s.trim()).filter(Boolean);
    }
    onUpdate(patch);
    setDirty(false);
  };

  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input value={label} onChange={(e) => { setLabel(e.target.value); setDirty(true); }}
          className="flex-1 min-w-[160px] px-2 py-1.5 text-sm rounded-md border border-border bg-background font-body" />
        <span className="text-[10px] uppercase font-display font-bold text-muted-foreground bg-muted px-2 py-1 rounded">{field.field_type}</span>
        <button onClick={save} disabled={!dirty}
          className="flex items-center gap-1 px-2 py-1.5 text-xs rounded-md bg-foreground text-background font-display font-semibold disabled:opacity-30">
          <Save className="w-3 h-3" /> Enregistrer
        </button>
        <button onClick={onDelete} className="p-1.5 text-destructive hover:bg-destructive/10 rounded-md">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      {(field.field_type === "select" || field.field_type === "multiselect") && (
        <input value={opts} onChange={(e) => { setOpts(e.target.value); setDirty(true); }}
          placeholder="Options séparées par des virgules"
          className="mt-2 w-full px-2 py-1.5 text-xs rounded-md border border-border bg-background font-body" />
      )}
    </div>
  );
};

export default AdminCustomFields;