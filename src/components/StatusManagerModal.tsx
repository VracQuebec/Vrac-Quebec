import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useLeadStatuses, type LeadStatus } from "@/hooks/useLeadStatuses";
import { X, Plus, Trash2, GripVertical, Eye, EyeOff, Loader2 } from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, verticalListSortingStrategy,
  useSortable, sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Props { onClose: () => void; }

const PRESET_COLORS = [
  "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e", "#10b981",
  "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1", "#8b5cf6",
  "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#ef4444", "#dc2626",
  "#64748b", "#475569", "#1f2937", "#000000",
];

const StatusManagerModal = ({ onClose }: Props) => {
  const { statuses, refresh } = useLeadStatuses();
  const [items, setItems] = useState<LeadStatus[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setItems(statuses); }, [statuses]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const persist = async (next: LeadStatus[]) => {
    setItems(next);
    setSaving(true);
    // Update sort_order in DB based on new positions
    const updates = next.map((s, idx) => ({ id: s.id, sort_order: (idx + 1) * 10 }));
    for (const u of updates) {
      await supabase.from("lead_statuses").update({ sort_order: u.sort_order }).eq("id", u.id);
    }
    setSaving(false);
    refresh();
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((i) => i.id === active.id);
    const newIdx = items.findIndex((i) => i.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    persist(arrayMove(items, oldIdx, newIdx));
  };

  const updateField = async (id: string, patch: Partial<LeadStatus>) => {
    setItems((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    setSaving(true);
    const { error } = await supabase.from("lead_statuses").update(patch).eq("id", id);
    setSaving(false);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      refresh();
    }
  };

  const addStatus = async () => {
    const label = prompt("Nom du nouveau statut ?")?.trim();
    if (!label) return;
    const value = label.toLowerCase();
    if (items.some((s) => s.value === value)) {
      toast({ title: "Statut déjà existant", variant: "destructive" });
      return;
    }
    const sort_order = (items.length + 1) * 10;
    const { error } = await supabase.from("lead_statuses").insert({
      value, label, color: "#64748b", text_color: "#ffffff", sort_order, enabled: true,
    });
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    else { toast({ title: "Statut ajouté" }); refresh(); }
  };

  const deleteStatus = async (s: LeadStatus) => {
    if (!confirm(`Supprimer le statut « ${s.label} » ?`)) return;
    const { error } = await supabase.from("lead_statuses").delete().eq("id", s.id);
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    else { toast({ title: "Statut supprimé" }); refresh(); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="bg-card w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl border border-border max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-display font-bold text-lg">Gérer les statuts de leads</h2>
            <p className="text-xs text-muted-foreground font-body">
              Glisser-déposer pour réorganiser. Les modifications sont enregistrées automatiquement.
            </p>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="p-2 hover:bg-secondary rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-2 flex-1">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {items.map((s) => (
                <SortableRow
                  key={s.id}
                  status={s}
                  onChange={(patch) => updateField(s.id, patch)}
                  onDelete={() => deleteStatus(s)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground font-body flex items-center gap-2">
            {saving ? (<><Loader2 className="w-3.5 h-3.5 animate-spin" /> Enregistrement…</>) : "Sauvegarde automatique"}
          </div>
          <button
            onClick={addStatus}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-sm"
          >
            <Plus className="w-4 h-4" /> Ajouter un statut
          </button>
        </div>
      </div>
    </div>
  );
};

interface RowProps {
  status: LeadStatus;
  onChange: (patch: Partial<LeadStatus>) => void;
  onDelete: () => void;
}

const SortableRow = ({ status, onChange, onDelete }: RowProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: status.id });
  const [labelDraft, setLabelDraft] = useState(status.label);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => { setLabelDraft(status.label); }, [status.label]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-background border border-border rounded-xl p-3 flex items-center gap-2 sm:gap-3 touch-none"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Réorganiser"
        className="p-2 -m-2 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="w-5 h-5" />
      </button>

      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-label="Couleur"
          className="w-9 h-9 rounded-lg border-2 border-border"
          style={{ backgroundColor: status.color }}
        />
        {pickerOpen && (
          <div className="absolute z-10 mt-2 left-0 bg-card border border-border rounded-xl p-2 shadow-lg w-[208px] grid grid-cols-6 gap-1.5">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => { onChange({ color: c }); setPickerOpen(false); }}
                className="w-8 h-8 rounded-md border border-border"
                style={{ backgroundColor: c }}
                aria-label={c}
              />
            ))}
            <input
              type="color"
              value={status.color}
              onChange={(e) => onChange({ color: e.target.value })}
              className="col-span-6 w-full h-8 rounded mt-1 cursor-pointer"
            />
          </div>
        )}
      </div>

      <input
        type="text"
        value={labelDraft}
        onChange={(e) => setLabelDraft(e.target.value)}
        onBlur={() => { if (labelDraft.trim() && labelDraft !== status.label) onChange({ label: labelDraft.trim() }); }}
        className="flex-1 min-w-0 px-2 py-1.5 text-sm rounded-md border border-border bg-card font-body focus:outline-none focus:ring-2 focus:ring-primary/40"
      />

      <button
        type="button"
        onClick={() => onChange({ enabled: !status.enabled })}
        title={status.enabled ? "Désactiver" : "Activer"}
        className={`p-2 rounded-lg ${status.enabled ? "text-emerald-600 hover:bg-emerald-50" : "text-muted-foreground hover:bg-secondary"}`}
      >
        {status.enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
      </button>

      <button
        type="button"
        onClick={onDelete}
        title="Supprimer"
        className="p-2 rounded-lg text-rose-600 hover:bg-rose-50"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
};

export default StatusManagerModal;