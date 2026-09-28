import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import FullPageState from "@/components/FullPageState";
import { toast } from "@/hooks/use-toast";
import { Loader2, Phone, Mail, MapPin, ArrowLeft, X, Clock } from "lucide-react";
import { ACCESS_STATUSES, visibleStatuses, normalizeStatus, statusMeta, statusLabel } from "@/lib/access-requests/status";
import AccessRequestStats from "@/components/admin/AccessRequestStats";

interface TR {
  id: string;
  request_number: string;
  client_name: string;
  client_company: string | null;
  client_phone: string;
  client_email: string | null;
  site_address: string;
  site_city: string | null;
  site_latitude: number | null;
  site_longitude: number | null;
  source: string | null;
  client_notes: string | null;
  material_other: string | null;
  owner_contacted: boolean | null;
  owner_contacted_at: string | null;
  alternative_dumps: any;
  material_type: string;
  quantity: number | null;
  quantity_unit: string | null;
  dump_name: string | null;
  distance_km: number | null;
  travel_time_minutes: number | null;
  truck_type: string | null;
  estimated_trips: number | null;
  desired_date: string | null;
  desired_time: string | null;
  status: string;
  internal_notes: string | null;
  created_at: string;
}

interface HistoryEntry {
  id: string;
  field_key: string;
  old_value: any;
  new_value: any;
  user_email: string | null;
  created_at: string;
}

const AdminTransportRequests = () => {
  const navigate = useNavigate();
  const { user, isReady } = useAuthReady();
  const { isAdmin, loading: roleLoading } = useUserRoles(user, isReady);
  const [rows, setRows] = useState<TR[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<TR | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    if (!isReady) return;
    if (!user) navigate("/login", { replace: true });
  }, [isReady, user, navigate]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("transport_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    else setRows((data as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    const ch = supabase
      .channel(`admin-transport-requests-` + Math.random().toString(36).slice(2))
      .on("postgres_changes", { event: "*", schema: "public", table: "transport_requests" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isAdmin]);

  const openDetail = async (r: TR) => {
    setSelected(r);
    const { data } = await supabase
      .from("transport_request_history")
      .select("*")
      .eq("request_id", r.id)
      .order("created_at", { ascending: false });
    setHistory((data as any) || []);
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("transport_requests").update({ status: status as any }).eq("id", id);
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    else toast({ title: "Statut mis à jour" });
  };

  const updateNotes = async (id: string, notes: string) => {
    const { error } = await supabase.from("transport_requests").update({ internal_notes: notes }).eq("id", id);
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
  };

  const updateOwnerContacted = async (id: string, contacted: boolean) => {
    const { error } = await supabase
      .from("transport_requests")
      .update({ owner_contacted: contacted, owner_contacted_at: contacted ? new Date().toISOString() : null } as any)
      .eq("id", id);
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
  };

  const filtered = useMemo(
    () => (statusFilter === "all" ? rows : rows.filter((r) => normalizeStatus(r.status) === statusFilter)),
    [rows, statusFilter]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    ACCESS_STATUSES.forEach((s) => (c[s.value] = rows.filter((r) => normalizeStatus(r.status) === s.value).length));
    return c;
  }, [rows]);

  if (!isReady || roleLoading) return <FullPageState title="Chargement…" />;
  if (!isAdmin) return <FullPageState title="Accès refusé" message="Réservé aux administrateurs." />;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky-below-nav z-30">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin" className="p-1.5 rounded hover:bg-muted"><ArrowLeft className="w-4 h-4" /></Link>
            <h1 className="font-display font-bold text-lg">Demandes d'accès aux dompes</h1>
            <span className="text-xs text-muted-foreground font-body">({rows.length})</span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4">
        <AccessRequestStats />

        {/* Status pills */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          <StatusPill label={`Toutes (${counts.all})`} active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
          {ACCESS_STATUSES.filter((s) => !s.hidden || (counts[s.value] || 0) > 0).map((s) => (
            <StatusPill
              key={s.value}
              label={`${s.label} (${counts[s.value] || 0})`}
              color={s.color}
              active={statusFilter === s.value}
              onClick={() => setStatusFilter(s.value)}
            />
          ))}
        </div>

        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Aucune demande.</p>
        ) : (
          <div className="overflow-x-auto bg-card rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2">N°</th>
                  <th className="text-left px-3 py-2">Client</th>
                  <th className="text-left px-3 py-2">Chantier</th>
                  <th className="text-left px-3 py-2">Matériau</th>
                  <th className="text-left px-3 py-2">Dompe</th>
                  <th className="text-left px-3 py-2">Statut</th>
                  <th className="text-left px-3 py-2">Créée</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} onClick={() => openDetail(r)} className="border-t border-border hover:bg-muted/30 cursor-pointer">
                    <td className="px-3 py-2 font-display font-bold">{r.request_number}</td>
                    <td className="px-3 py-2">
                      <div className="font-display font-semibold">{r.client_name}</div>
                      {r.client_company && <div className="text-xs text-muted-foreground">{r.client_company}</div>}
                      <div className="text-xs text-muted-foreground">{r.client_phone}</div>
                    </td>
                    <td className="px-3 py-2 text-xs max-w-xs truncate">{r.site_address}</td>
                    <td className="px-3 py-2 text-xs capitalize">{r.material_type}{r.quantity ? ` — ${r.quantity} ${r.quantity_unit || ""}` : ""}</td>
                    <td className="px-3 py-2 text-xs">{r.dump_name || "—"}{r.distance_km ? <div className="text-muted-foreground">{r.distance_km} km</div> : null}</td>
                    <td className="px-3 py-2">
                      <span
                        className="inline-block px-2 py-0.5 rounded-full text-[10px] font-display font-bold text-white"
                        style={{ background: statusMeta(r.status).color }}
                      >
                        {statusMeta(r.status).label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("fr-CA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setSelected(null)}>
          <div className="flex-1 bg-black/50" />
          <aside
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:w-[520px] bg-background border-l border-border h-full overflow-y-auto"
          >
            <div className="p-4 border-b border-border flex items-center justify-between sticky top-0 bg-background z-10">
              <div>
                <div className="text-xs text-muted-foreground">Demande</div>
                <div className="font-display font-bold text-lg">{selected.request_number}</div>
              </div>
              <button onClick={() => setSelected(null)} className="p-1.5 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-4 space-y-4">
              <section>
                <label className="block text-xs font-display font-bold uppercase text-muted-foreground mb-1">Statut</label>
                <select
                  value={normalizeStatus(selected.status)}
                  onChange={(e) => {
                    updateStatus(selected.id, e.target.value);
                    setSelected({ ...selected, status: e.target.value });
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm"
                >
                  {visibleStatuses(selected.status).map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!selected.owner_contacted}
                    onChange={(e) => {
                      updateOwnerContacted(selected.id, e.target.checked);
                      setSelected({ ...selected, owner_contacted: e.target.checked });
                    }}
                  />
                  Propriétaire de la dompe contacté
                  {selected.owner_contacted_at && (
                    <span className="text-xs text-muted-foreground">
                      ({new Date(selected.owner_contacted_at).toLocaleDateString("fr-CA")})
                    </span>
                  )}
                </label>
              </section>

              <section className="bg-card rounded-lg border border-border p-3">
                <h3 className="font-display font-bold text-sm mb-2">Client</h3>
                <div className="space-y-1 text-sm">
                  <div>{selected.client_name}{selected.client_company ? ` — ${selected.client_company}` : ""}</div>
                  <a href={`tel:${selected.client_phone}`} className="flex items-center gap-1.5 text-primary"><Phone className="w-3.5 h-3.5" />{selected.client_phone}</a>
                  {selected.client_email && (
                    <a href={`mailto:${selected.client_email}`} className="flex items-center gap-1.5 text-primary text-xs"><Mail className="w-3.5 h-3.5" />{selected.client_email}</a>
                  )}
                </div>
              </section>

              <section className="bg-card rounded-lg border border-border p-3">
                <h3 className="font-display font-bold text-sm mb-2">Chantier</h3>
                <div className="flex items-start gap-1.5 text-sm"><MapPin className="w-3.5 h-3.5 mt-0.5 text-muted-foreground" />{selected.site_address}</div>
                {selected.site_city && <div className="text-xs text-muted-foreground mt-1">{selected.site_city}</div>}
                {selected.site_latitude != null && selected.site_longitude != null && (
                  <a
                    className="text-xs text-primary"
                    href={`https://www.google.com/maps/search/?api=1&query=${selected.site_latitude},${selected.site_longitude}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    GPS {selected.site_latitude.toFixed(5)}, {selected.site_longitude.toFixed(5)}
                  </a>
                )}
              </section>

              <section className="bg-card rounded-lg border border-border p-3 grid grid-cols-2 gap-2 text-sm">
                <div><b>Matériau :</b> {selected.material_type}</div>
                <div><b>Sous-type :</b> {selected.material_other || "—"}</div>
                <div><b>Quantité :</b> {selected.quantity ? `${selected.quantity} ${selected.quantity_unit}` : "—"}</div>
                <div><b>Dompe :</b> {selected.dump_name || "—"}</div>
                <div><b>Distance :</b> {selected.distance_km ? `${selected.distance_km} km` : "—"}</div>
                <div><b>Camion :</b> {selected.truck_type || "—"}</div>
                <div><b>Voyages :</b> {selected.estimated_trips || "—"}</div>
                <div><b>Date :</b> {selected.desired_date || "—"}</div>
                <div><b>Heure :</b> {selected.desired_time || "—"}</div>
                <div><b>Temps estimé :</b> {selected.travel_time_minutes ? `${selected.travel_time_minutes} min` : "—"}</div>
                <div><b>Source :</b> {selected.source || "—"}</div>
                <div className="col-span-2"><b>Reçue le :</b> {new Date(selected.created_at).toLocaleString("fr-CA")}</div>
              </section>

              {Array.isArray(selected.alternative_dumps) && selected.alternative_dumps.length > 0 && (
                <section className="bg-card rounded-lg border border-border p-3">
                  <h3 className="font-display font-bold text-sm mb-2">Dompes alternatives</h3>
                  <ul className="space-y-1 text-xs">
                    {selected.alternative_dumps.map((d: any, i: number) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span>{d.name || d.dump_name || "Dompe"}</span>
                        <span className="text-muted-foreground">
                          {d.distance_km ? `${d.distance_km} km` : ""}{d.duration_minutes ? ` • ${d.duration_minutes} min` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {selected.client_notes && (
                <section className="bg-card rounded-lg border border-border p-3">
                  <h3 className="font-display font-bold text-sm mb-2">Notes de l'entrepreneur</h3>
                  <p className="text-xs whitespace-pre-line text-muted-foreground">{selected.client_notes}</p>
                </section>
              )}

              <section>
                <label className="block text-xs font-display font-bold uppercase text-muted-foreground mb-1">Notes internes</label>
                <textarea
                  defaultValue={selected.internal_notes || ""}
                  onBlur={(e) => updateNotes(selected.id, e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm resize-y"
                  placeholder="Ajouter une note…"
                />
              </section>

              <section>
                <h3 className="font-display font-bold text-sm mb-2 flex items-center gap-1.5"><Clock className="w-4 h-4" /> Historique</h3>
                {history.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Aucune modification enregistrée.</p>
                ) : (
                  <ul className="space-y-1.5 text-xs">
                    {history.slice(0, 20).map((h) => (
                      <li key={h.id} className="p-2 bg-muted/30 rounded border border-border">
                        <div className="flex items-center justify-between mb-0.5">
                          <b>{FIELD_LABELS[h.field_key] || h.field_key}</b>
                          <span className="text-muted-foreground">{new Date(h.created_at).toLocaleString("fr-CA")}</span>
                        </div>
                        {h.field_key === "created" ? (
                          <div className="text-muted-foreground">Demande reçue via l'assistant.</div>
                        ) : (
                          <div className="text-muted-foreground">
                            {formatHistoryVal(h.field_key, h.old_value)} → <span className="text-foreground">{formatHistoryVal(h.field_key, h.new_value)}</span>
                          </div>
                        )}
                        {h.user_email && <div className="text-muted-foreground mt-0.5">par {h.user_email}</div>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};

const StatusPill = ({ label, active, color, onClick }: { label: string; active: boolean; color?: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`px-3 py-1 rounded-full text-xs font-display font-bold border transition-all ${
      active ? "text-white border-transparent" : "bg-card text-foreground border-border hover:border-primary/40"
    }`}
    style={active ? { background: color || "#111" } : undefined}
  >
    {label}
  </button>
);

const FIELD_LABELS: Record<string, string> = {
  created: "Demande créée",
  status: "Statut modifié",
  internal_notes: "Note interne",
  owner_contacted: "Propriétaire contacté",
  owner_contacted_at: "Date de contact du propriétaire",
  assigned_dispatcher: "Responsable assigné",
  driver_id: "Chauffeur assigné",
  truck_id: "Camion assigné",
  desired_date: "Date souhaitée",
  desired_time: "Heure souhaitée",
  dump_name: "Dompe sélectionnée",
};

const formatHistoryVal = (field: string, v: any) => {
  if (field === "status") return statusLabel(formatVal(v));
  if (field === "owner_contacted") return formatVal(v) === "true" ? "Oui" : "Non";
  return formatVal(v);
};

const formatVal = (v: any) => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v.replace(/^"|"$/g, "");
  return JSON.stringify(v);
};

export default AdminTransportRequests;