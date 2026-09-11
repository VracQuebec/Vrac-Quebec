import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/useUserRole";
import { useAuthReady } from "@/hooks/useAuthReady";
import FullPageState from "@/components/FullPageState";
import TransportBanner from "@/components/TransportBanner";
import { toast } from "@/hooks/use-toast";
import {
  ArrowLeft, Ban, Loader2, Plus, Search, ShieldOff, RotateCcw, History as HistoryIcon, X,
} from "lucide-react";

type EntityType = "entrepreneur" | "dompe" | "client";

type Entry = {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  entity_label: string | null;
  reasons: string[];
  note: string | null;
  active: boolean;
  blocked_by_email: string | null;
  blocked_at: string;
  unblocked_by_email: string | null;
  unblocked_at: string | null;
  unblock_note: string | null;
};

type HistoryRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  entity_label: string | null;
  action: string;
  reasons: string[] | null;
  note: string | null;
  actor_email: string | null;
  created_at: string;
};

const REASON_OPTIONS = [
  "Non-paiement",
  "Annulations répétées",
  "Comportement irrespectueux",
  "Fraude",
  "Informations fausses",
  "Non-respect des ententes",
  "Problème de sécurité",
  "Autre",
];

const TYPE_LABEL: Record<EntityType, string> = {
  entrepreneur: "Entrepreneur",
  dompe: "Dompe",
  client: "Client",
};

export default function AdminBlacklist() {
  const navigate = useNavigate();
  const { user, isReady: authReady } = useAuthReady();
  const { isAdmin, loading: roleLoading } = useUserRoles(user, authReady);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | EntityType>("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");
  const [addOpen, setAddOpen] = useState(false);
  const [historyFor, setHistoryFor] = useState<Entry | null>(null);
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);

  useEffect(() => {
    if (!authReady || roleLoading) return;
    if (!user) navigate("/login", { replace: true });
    else if (!isAdmin) navigate("/login", { replace: true });
  }, [authReady, user, isAdmin, roleLoading, navigate]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("blacklist_entries")
      .select("*")
      .order("blocked_at", { ascending: false });
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    setEntries((data as Entry[]) || []);
    setLoading(false);
  };

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (typeFilter !== "all" && e.entity_type !== typeFilter) return false;
      if (statusFilter === "active" && !e.active) return false;
      if (statusFilter === "inactive" && e.active) return false;
      if (q) {
        const s = `${e.entity_label ?? ""} ${e.note ?? ""} ${e.reasons.join(" ")}`.toLowerCase();
        if (!s.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [entries, q, typeFilter, statusFilter]);

  const openHistory = async (entry: Entry) => {
    setHistoryFor(entry);
    const { data } = await supabase
      .from("blacklist_history")
      .select("*")
      .eq("entity_type", entry.entity_type)
      .eq("entity_id", entry.entity_id)
      .order("created_at", { ascending: false });
    setHistoryRows((data as HistoryRow[]) || []);
  };

  const unblock = async (entry: Entry) => {
    const note = window.prompt("Note de déblocage (optionnel)") ?? "";
    const { error } = await supabase
      .from("blacklist_entries")
      .update({
        active: false,
        unblocked_by: user?.id,
        unblocked_by_email: user?.email,
        unblocked_at: new Date().toISOString(),
        unblock_note: note || null,
      })
      .eq("id", entry.id);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    await supabase.from("blacklist_history").insert({
      entry_id: entry.id,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      entity_label: entry.entity_label,
      action: "unblock",
      reasons: entry.reasons,
      note: note || null,
      actor_id: user?.id,
      actor_email: user?.email,
    });
    toast({ title: "Déblocage effectué" });
    load();
  };

  if (!authReady || !user || roleLoading) {
    return <FullPageState title="Chargement" message="Vérification des accès administrateur." />;
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border bg-card">
        <div className="container mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/admin" className="min-h-10 flex items-center gap-2 text-sm font-display font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Retour à l'admin
          </Link>
          <h1 className="font-display font-bold flex items-center gap-2"><Ban className="w-5 h-5 text-red-500" /> Liste noire</h1>
        </div>
      </nav>
      <TransportBanner />

      <main className="container mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher (nom, raison, note)…"
              className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-border bg-card font-body"
            />
          </div>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} className="px-3 py-2 text-sm rounded-lg border border-border bg-card font-body">
            <option value="all">Tous les types</option>
            <option value="entrepreneur">Entrepreneurs</option>
            <option value="dompe">Dompes</option>
            <option value="client">Clients</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="px-3 py-2 text-sm rounded-lg border border-border bg-card font-body">
            <option value="active">Actifs</option>
            <option value="inactive">Débloqués</option>
            <option value="all">Tous</option>
          </select>
          <button onClick={() => setAddOpen(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-display font-semibold hover:opacity-90">
            <Plus className="w-4 h-4" /> Ajouter à la liste noire
          </button>
        </div>

        <div className="text-sm text-muted-foreground font-body mb-3">{filtered.length} entrée(s)</div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground font-body">Aucune entrée.</div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((e) => (
              <div key={e.id} className="bg-card border border-border rounded-lg p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-display font-bold ${e.active ? "bg-red-600 text-white" : "bg-secondary text-muted-foreground"}`}>
                        {e.active ? <><Ban className="w-3 h-3" /> Compte bloqué</> : "Débloqué"}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded bg-secondary font-display font-semibold">{TYPE_LABEL[e.entity_type]}</span>
                      <span className="font-display font-bold">{e.entity_label || e.entity_id}</span>
                    </div>
                    {e.reasons.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {e.reasons.map((r) => <span key={r} className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-800 font-body">{r}</span>)}
                      </div>
                    )}
                    {e.note && <p className="mt-2 text-sm text-muted-foreground font-body whitespace-pre-wrap">{e.note}</p>}
                    <div className="mt-2 text-xs text-muted-foreground font-body">
                      Bloqué le {new Date(e.blocked_at).toLocaleString("fr-CA")} par {e.blocked_by_email || "—"}
                      {!e.active && e.unblocked_at && <> · Débloqué le {new Date(e.unblocked_at).toLocaleString("fr-CA")} par {e.unblocked_by_email || "—"}</>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openHistory(e)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-secondary text-foreground text-xs font-display font-semibold hover:opacity-90">
                      <HistoryIcon className="w-3.5 h-3.5" /> Historique
                    </button>
                    {e.active && (
                      <button onClick={() => unblock(e)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-display font-semibold hover:opacity-90">
                        <RotateCcw className="w-3.5 h-3.5" /> Débloquer
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {addOpen && <AddBlacklistModal onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load(); }} user={user} />}
      {historyFor && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setHistoryFor(null)}>
          <div className="bg-card border border-border rounded-lg max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-display font-bold">Historique — {historyFor.entity_label || historyFor.entity_id}</h2>
              <button onClick={() => setHistoryFor(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-3">
              {historyRows.length === 0 ? (
                <p className="text-sm text-muted-foreground font-body">Aucun historique.</p>
              ) : historyRows.map((h) => (
                <div key={h.id} className="border border-border rounded p-3">
                  <div className="text-xs text-muted-foreground font-body">{new Date(h.created_at).toLocaleString("fr-CA")} — {h.actor_email || "—"}</div>
                  <div className="mt-1 font-display font-semibold text-sm">
                    {h.action === "block" ? "🚫 Bloqué" : h.action === "unblock" ? "✅ Débloqué" : "✏️ Modifié"}
                  </div>
                  {h.reasons && h.reasons.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">{h.reasons.map((r) => <span key={r} className="text-xs px-2 py-0.5 rounded bg-secondary font-body">{r}</span>)}</div>
                  )}
                  {h.note && <p className="mt-1 text-sm font-body whitespace-pre-wrap">{h.note}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AddBlacklistModal({ onClose, onSaved, user }: { onClose: () => void; onSaved: () => void; user: any }) {
  const [entityType, setEntityType] = useState<EntityType>("entrepreneur");
  const [targets, setTargets] = useState<{ id: string; label: string }[]>([]);
  const [entityId, setEntityId] = useState("");
  const [entityLabel, setEntityLabel] = useState("");
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setEntityId(""); setEntityLabel(""); setSearch("");
    (async () => {
      if (entityType === "entrepreneur") {
        const { data } = await supabase.rpc("list_users_with_roles");
        const list = ((data as any) || [])
          .filter((u: any) => (u.roles || []).includes("entrepreneur"))
          .map((u: any) => ({ id: u.user_id, label: u.email }));
        setTargets(list);
      } else if (entityType === "dompe") {
        const { data } = await supabase.from("submissions")
          .select("id, dompe_number, name, city")
          .not("dompe_number", "is", null).neq("dompe_number", "")
          .order("dompe_number", { ascending: true }).limit(2000);
        setTargets(((data as any) || []).map((s: any) => ({ id: s.id, label: `${s.dompe_number} — ${s.name || ""} (${s.city || ""})` })));
      } else {
        const { data } = await supabase.from("submissions")
          .select("id, name, phone, email, city, submission_number")
          .order("created_at", { ascending: false }).limit(2000);
        setTargets(((data as any) || []).map((s: any) => ({ id: s.id, label: `#${s.submission_number} — ${s.name || s.email || s.phone || "?"} (${s.city || ""})` })));
      }
    })();
  }, [entityType]);

  const filteredTargets = targets.filter((t) => !search || t.label.toLowerCase().includes(search.toLowerCase())).slice(0, 100);

  const toggleReason = (r: string) => setReasons((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]);

  const submit = async () => {
    if (!entityId) return toast({ title: "Sélectionne une cible", variant: "destructive" });
    if (reasons.length === 0) return toast({ title: "Sélectionne au moins une raison", variant: "destructive" });
    setSaving(true);
    const { data: inserted, error } = await supabase.from("blacklist_entries").insert({
      entity_type: entityType,
      entity_id: entityId,
      entity_label: entityLabel,
      reasons,
      note: note || null,
      blocked_by: user?.id,
      blocked_by_email: user?.email,
    }).select().single();
    if (error) {
      setSaving(false);
      return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
    await supabase.from("blacklist_history").insert({
      entry_id: inserted.id,
      entity_type: entityType,
      entity_id: entityId,
      entity_label: entityLabel,
      action: "block",
      reasons,
      note: note || null,
      actor_id: user?.id,
      actor_email: user?.email,
    });
    setSaving(false);
    toast({ title: "Compte bloqué" });
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-display font-bold flex items-center gap-2"><ShieldOff className="w-5 h-5 text-red-500" /> Ajouter à la liste noire</h2>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs font-display font-bold uppercase text-muted-foreground">Type</label>
            <div className="mt-1 flex gap-2">
              {(["entrepreneur", "dompe", "client"] as EntityType[]).map((t) => (
                <button key={t} onClick={() => setEntityType(t)} className={`px-3 py-1.5 rounded-lg text-sm font-display font-semibold ${entityType === t ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{TYPE_LABEL[t]}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-display font-bold uppercase text-muted-foreground">Cible</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-border bg-background font-body" />
            <div className="mt-2 max-h-48 overflow-y-auto border border-border rounded-lg">
              {filteredTargets.map((t) => (
                <button key={t.id} onClick={() => { setEntityId(t.id); setEntityLabel(t.label); }} className={`w-full text-left px-3 py-2 text-sm font-body border-b border-border last:border-0 hover:bg-secondary ${entityId === t.id ? "bg-secondary" : ""}`}>
                  {t.label}
                </button>
              ))}
              {filteredTargets.length === 0 && <div className="p-3 text-sm text-muted-foreground font-body">Aucun résultat.</div>}
            </div>
            {entityLabel && <div className="mt-1 text-xs text-muted-foreground font-body">Sélection : {entityLabel}</div>}
          </div>

          <div>
            <label className="text-xs font-display font-bold uppercase text-muted-foreground">Raisons</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {REASON_OPTIONS.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm font-body cursor-pointer">
                  <input type="checkbox" checked={reasons.includes(r)} onChange={() => toggleReason(r)} className="accent-red-600" />
                  {r}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-display font-bold uppercase text-muted-foreground">Note explicative</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-border bg-background font-body" placeholder="Contexte supplémentaire (optionnel)…" />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-secondary text-foreground text-sm font-display font-semibold">Annuler</button>
            <button onClick={submit} disabled={saving} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-display font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              <Ban className="w-4 h-4" /> Bloquer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}