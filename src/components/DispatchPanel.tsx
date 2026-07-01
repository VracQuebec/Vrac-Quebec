import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  X, ChevronLeft, ChevronRight, Phone, MessageSquare, Mail, MapPin,
  CalendarDays, Archive, Edit3, User as UserIcon, Truck,
} from "lucide-react";
import { REQUEST_TYPES, LEAD_PRIORITIES, MATERIAL_TYPES } from "@/lib/questionnaire-data";
import type { LeadStatus } from "@/hooks/useLeadStatuses";
import { useIsMobile } from "@/hooks/use-mobile";

export interface DispatchSubmission {
  id: string;
  submission_number: number | null;
  dompe_number?: string | null;
  name: string;
  phone: string | null;
  email: string;
  address: string;
  postal_code: string | null;
  materials: string[];
  quantity: string;
  budget_unit: string | null;
  budget_max: string | null;
  request_type: string;
  priority: string;
  status: string;
  assigned_entrepreneur: string | null;
  internal_notes: string;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at?: string | null;
  visible_to_entrepreneur?: boolean;
}

interface Props {
  sub: DispatchSubmission;
  list: DispatchSubmission[];
  entrepreneurs: { user_id: string; email: string }[];
  leadStatuses: LeadStatus[];
  onClose: () => void;
  onSelect: (id: string) => void;
  onUpdate: (patch: Partial<DispatchSubmission>) => void | Promise<void>;
  onOpenFullEdit: (id: string) => void;
}

const fmt = (d?: string | null) =>
  d ? new Date(d).toLocaleString("fr-CA", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const materialLabel = (id: string) => MATERIAL_TYPES.find((m) => m.id === id)?.label || id;

const DispatchPanel = ({ sub, list, entrepreneurs, leadStatuses, onClose, onSelect, onUpdate, onOpenFullEdit }: Props) => {
  const isMobile = useIsMobile();
  const idx = list.findIndex((s) => s.id === sub.id);
  const prev = idx > 0 ? list[idx - 1] : null;
  const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;

  // Local drafts for debounced text fields
  const [notes, setNotes] = useState(sub.internal_notes || "");
  const [quantity, setQuantity] = useState(sub.quantity || "");
  const [budget, setBudget] = useState(sub.budget_max || "");
  const [budgetUnit, setBudgetUnit] = useState(sub.budget_unit || "");
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qtyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const budgetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset drafts when the selected submission changes
  useEffect(() => {
    setNotes(sub.internal_notes || "");
    setQuantity(sub.quantity || "");
    setBudget(sub.budget_max || "");
    setBudgetUnit(sub.budget_unit || "");
  }, [sub.id]);

  const phoneClean = (sub.phone || "").replace(/\D/g, "");
  const mapsUrl = sub.latitude && sub.longitude
    ? `https://www.google.com/maps?q=${sub.latitude},${sub.longitude}`
    : `https://www.google.com/maps?q=${encodeURIComponent(`${sub.address} ${sub.postal_code || ""}`)}`;

  const currentStatus = useMemo(
    () => leadStatuses.find((s) => s.value === sub.status) || leadStatuses[0],
    [sub.status, leadStatuses]
  );

  const shell = isMobile
    ? "fixed inset-x-0 bottom-0 z-40 max-h-[85vh] rounded-t-2xl shadow-2xl border-t"
    : "fixed right-0 top-0 z-40 h-screen w-[420px] max-w-[95vw] shadow-2xl border-l";

  return (
    <div
      className={`${shell} bg-card border-border flex flex-col animate-in fade-in slide-in-from-right-4`}
      style={{ boxShadow: "0 10px 40px rgba(0,0,0,0.18)" }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-2 sticky top-0 bg-card z-10">
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!prev}
            onClick={() => prev && onSelect(prev.id)}
            className="p-1.5 rounded-md border border-border disabled:opacity-40 hover:bg-secondary"
            title="Lead précédent"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={!next}
            onClick={() => next && onSelect(next.id)}
            className="p-1.5 rounded-md border border-border disabled:opacity-40 hover:bg-secondary"
            title="Lead suivant"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="text-[11px] text-muted-foreground ml-1">
            {idx >= 0 ? `${idx + 1}/${list.length}` : ""}
          </span>
        </div>
        <div className="flex-1 min-w-0 text-right">
          <div className="text-[11px] text-muted-foreground truncate">
            {sub.dompe_number || `#${sub.submission_number ?? ""}`}
          </div>
          <div className="font-display font-bold text-sm truncate">{sub.name}</div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-secondary" title="Fermer">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Status bar */}
      {currentStatus && (
        <div
          className="px-4 py-1.5 text-[11px] font-display font-bold uppercase tracking-wide"
          style={{ background: currentStatus.color, color: currentStatus.text_color }}
        >
          {currentStatus.label}
        </div>
      )}

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Quick actions */}
        <div className="flex flex-wrap gap-1.5">
          {sub.phone && (
            <>
              <a href={`tel:${phoneClean}`} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold">
                <Phone className="w-3.5 h-3.5" /> Appeler
              </a>
              <a href={`sms:${phoneClean}`} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-foreground text-background text-xs font-display font-semibold">
                <MessageSquare className="w-3.5 h-3.5" /> SMS
              </a>
              <a href={`https://wa.me/1${phoneClean}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#25D366] text-white text-xs font-display font-semibold">
                🟢 WhatsApp
              </a>
            </>
          )}
          <a href={`mailto:${sub.email}`} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-display font-semibold">
            <Mail className="w-3.5 h-3.5" /> Courriel
          </a>
          <a href={mapsUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-display font-semibold">
            <MapPin className="w-3.5 h-3.5" /> Google Maps
          </a>
          <Link to={`/admin/calendrier?from_submission=${sub.id}`} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold">
            <CalendarDays className="w-3.5 h-3.5" /> Calendrier
          </Link>
          <button
            onClick={() => onOpenFullEdit(sub.id)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-secondary text-foreground border border-border text-xs font-display font-semibold"
          >
            <Edit3 className="w-3.5 h-3.5" /> Fiche complète
          </button>
          <button
            onClick={() => onUpdate({ status: sub.status === "archivé" ? "nouveau" : "archivé" })}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-600 text-white text-xs font-display font-semibold"
          >
            <Archive className="w-3.5 h-3.5" /> {sub.status === "archivé" ? "Restaurer" : "Archiver"}
          </button>
        </div>

        {/* Info */}
        <div className="rounded-lg bg-secondary/30 p-3 text-xs space-y-1 font-body">
          <div><b>Adresse :</b> {sub.address}{sub.postal_code ? `, ${sub.postal_code}` : ""}</div>
          {sub.phone && <div><b>Téléphone :</b> {sub.phone}</div>}
          <div><b>Courriel :</b> {sub.email}</div>
          <div><b>Matériaux :</b> {sub.materials.map(materialLabel).join(", ") || "—"}</div>
          <div className="text-muted-foreground text-[10px] pt-1">
            Créé le {fmt(sub.created_at)}
            {sub.updated_at ? ` • Modifié le ${fmt(sub.updated_at)}` : ""}
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="block text-[10px] uppercase tracking-wide font-display font-bold text-muted-foreground mb-1.5">Statut</label>
          <div className="flex flex-wrap gap-1.5">
            {leadStatuses.filter((s) => s.enabled || s.value === sub.status).map((s) => {
              const active = sub.status === s.value;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onUpdate({ status: s.value })}
                  style={active ? { backgroundColor: s.color, color: s.text_color, borderColor: "transparent" } : undefined}
                  className={`px-2 py-1 rounded text-[10px] font-display font-bold uppercase border ${active ? "" : "bg-card text-muted-foreground border-border hover:border-foreground/40"}`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Type + Priority */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wide font-display font-bold text-muted-foreground mb-1.5">Type de demande</label>
            <select
              value={sub.request_type || ""}
              onChange={(e) => {
                const v = e.target.value;
                const patch: Partial<DispatchSubmission> = { request_type: v };
                if (v === "remblai" || v === "depot") patch.visible_to_entrepreneur = true;
                else if (v === "vrac") patch.visible_to_entrepreneur = false;
                onUpdate(patch);
              }}
              className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background font-body"
            >
              {REQUEST_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wide font-display font-bold text-muted-foreground mb-1.5">Priorité</label>
            <div className="flex gap-1.5">
              {LEAD_PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => onUpdate({ priority: p.value })}
                  className={`flex-1 px-2 py-1.5 rounded text-[10px] font-display font-bold uppercase border ${sub.priority === p.value ? p.color + " border-transparent" : "bg-card text-muted-foreground border-border hover:border-foreground/40"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Assigned entrepreneur */}
        <div>
          <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-display font-bold text-muted-foreground mb-1.5">
            <UserIcon className="w-3 h-3" /> Entrepreneur assigné
          </label>
          <select
            value={sub.assigned_entrepreneur || ""}
            onChange={(e) => onUpdate({ assigned_entrepreneur: e.target.value || null })}
            className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background font-body"
          >
            <option value="">— Aucun —</option>
            {entrepreneurs.map((e) => (
              <option key={e.user_id} value={e.user_id}>{e.email}</option>
            ))}
          </select>
        </div>

        {/* Trips + Budget */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-display font-bold text-muted-foreground mb-1.5">
              <Truck className="w-3 h-3" /> Nombre de voyages
            </label>
            <input
              type="text"
              value={quantity}
              onChange={(e) => {
                const v = e.target.value;
                setQuantity(v);
                if (qtyTimer.current) clearTimeout(qtyTimer.current);
                qtyTimer.current = setTimeout(() => onUpdate({ quantity: v }), 700);
              }}
              className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background font-body"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wide font-display font-bold text-muted-foreground mb-1.5">Budget</label>
            <div className="flex gap-1">
              <input
                type="text"
                value={budget}
                onChange={(e) => {
                  const v = e.target.value;
                  setBudget(v);
                  if (budgetTimer.current) clearTimeout(budgetTimer.current);
                  budgetTimer.current = setTimeout(() => onUpdate({ budget_max: v }), 700);
                }}
                placeholder="—"
                className="flex-1 min-w-0 px-2 py-1.5 text-xs rounded-lg border border-border bg-background font-body"
              />
              <select
                value={budgetUnit}
                onChange={(e) => { setBudgetUnit(e.target.value); onUpdate({ budget_unit: e.target.value || null }); }}
                className="px-1 py-1.5 text-xs rounded-lg border border-border bg-background font-body"
              >
                <option value="">$</option>
                <option value="$">$</option>
                <option value="$/voyage">$/voyage</option>
                <option value="$/tonne">$/tonne</option>
              </select>
            </div>
          </div>
        </div>

        {/* Internal notes */}
        <div>
          <label className="block text-[10px] uppercase tracking-wide font-display font-bold text-muted-foreground mb-1.5">Notes internes</label>
          <textarea
            value={notes}
            onChange={(e) => {
              const v = e.target.value;
              setNotes(v);
              if (notesTimer.current) clearTimeout(notesTimer.current);
              notesTimer.current = setTimeout(() => onUpdate({ internal_notes: v }), 700);
            }}
            rows={4}
            className="w-full px-2 py-2 text-xs rounded-lg border border-border bg-background font-body resize-y"
            placeholder="Notes internes visibles uniquement par l'administration…"
          />
          <div className="text-[10px] text-muted-foreground italic mt-1">Sauvegarde automatique</div>
        </div>
      </div>
    </div>
  );
};

export default DispatchPanel;