import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import FullPageState from "@/components/FullPageState";
import { toast } from "@/hooks/use-toast";
import {
  AlertCircle, ArrowLeft, Check, ChevronDown, CircleEllipsis, Clock, Filter,
  Mail, MapPin, Phone, Search, X, XCircle,
} from "lucide-react";
import { ACCESS_STATUSES, normalizeStatus, statusLabel } from "@/lib/access-requests/status";
import { ACCESS_PRIORITIES, fetchAccessPriorities, priorityLabel, setAccessPriority, sortByPriority, type AccessPriority } from "@/lib/access-requests/priority";
import AccessRequestStats from "@/components/admin/AccessRequestStats";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AccessRequest {
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
  alternative_dumps: Array<Record<string, unknown>> | null;
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
  old_value: unknown;
  new_value: unknown;
  user_email: string | null;
  created_at: string;
}

type Filters = { search: string; priority: string; dump: string; entrepreneur: string; material: string; city: string; requestedFrom: string; desiredFrom: string };
const EMPTY_FILTERS: Filters = { search: "", priority: "all", dump: "all", entrepreneur: "all", material: "all", city: "all", requestedFrom: "", desiredFrom: "" };

const AdminTransportRequests = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isReady } = useAuthReady();
  const { isAdmin, loading: roleLoading } = useUserRoles(user, isReady);
  const [rows, setRows] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<AccessRequest | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [priorities, setPriorities] = useState<Record<string, AccessPriority | null>>({});

  useEffect(() => {
    if (!isReady) return;
    if (!user) navigate("/login", { replace: true });
  }, [isReady, user, navigate]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("transport_requests").select("*").order("created_at", { ascending: false });
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    else { setRows((data as unknown as AccessRequest[]) ?? []); setPriorities(await fetchAccessPriorities()); }
    setLoading(false);
  };

  useEffect(() => { if (isAdmin) void load(); }, [isAdmin]);
  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase.channel(`admin-transport-requests-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "transport_requests" }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [isAdmin]);

  // Historique de la fiche : journal existant de la demande + changements de
  // priorité déjà journalisés par le suivi (request_followup_events). Lecture seule.
  const loadHistory = async (id: string) => {
    const [{ data }, { data: ev }] = await Promise.all([
      supabase.from("transport_request_history").select("*").eq("request_id", id).order("created_at", { ascending: true }),
      supabase.from("request_followup_events").select("id, detail, actor_email, created_at").eq("entity_type", "transport_request").eq("entity_id", id).order("created_at", { ascending: true }),
    ]);
    const prio: HistoryEntry[] = (ev ?? []).flatMap((e) => {
      const p = (e.detail as { priority?: { avant: unknown; apres: unknown } } | null)?.priority;
      return p ? [{ id: `fu-${e.id}`, field_key: "priority", old_value: p.avant, new_value: p.apres, user_email: e.actor_email, created_at: e.created_at }] : [];
    });
    const merged = [...((data as unknown as HistoryEntry[]) ?? []), ...prio].sort((a, b) => a.created_at.localeCompare(b.created_at));
    setHistory(merged);
  };

  const openDetail = async (request: AccessRequest) => {
    setSelected(request);
    await loadHistory(request.id);
  };

  useEffect(() => {
    const requestedId = searchParams.get("id") ?? searchParams.get("request") ?? searchParams.get("demande");
    const match = requestedId ? rows.find((row) => row.id === requestedId) : undefined;
    if (match && selected?.id !== match.id) void openDetail(match);
  }, [rows, searchParams]);

  const updateStatus = async (status: string) => {
    if (!selected) return;
    const { error } = await supabase.from("transport_requests").update({ status: status as never }).eq("id", selected.id);
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    else {
      setSelected({ ...selected, status });
      setRows((current) => current.map((row) => row.id === selected.id ? { ...row, status } : row));
      toast({ title: "Statut mis à jour" });
    }
  };

  const updatePriority = async (priority: AccessPriority) => {
    if (!selected) return;
    try {
      await setAccessPriority(selected.id, selected.created_at, priority);
      setPriorities((m) => ({ ...m, [selected.id]: priority }));
      void loadHistory(selected.id);
      toast({ title: "Priorité mise à jour", description: priorityLabel(priority) });
    } catch (e) {
      toast({ title: "Erreur", description: (e as { message?: string })?.message ?? "Échec", variant: "destructive" });
    }
  };

  const updateNotes = async (notes: string) => {
    if (!selected) return;
    const { error } = await supabase.from("transport_requests").update({ internal_notes: notes }).eq("id", selected.id);
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
  };

  const updateOwnerContacted = async (contacted: boolean) => {
    if (!selected) return;
    const patch = { owner_contacted: contacted, owner_contacted_at: contacted ? new Date().toISOString() : null };
    const { error } = await supabase.from("transport_requests").update(patch).eq("id", selected.id);
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    else setSelected({ ...selected, ...patch });
  };

  const options = useMemo(() => ({
    dumps: unique(rows.map((r) => r.dump_name)),
    entrepreneurs: unique(rows.map((r) => r.client_company || r.client_name)),
    materials: unique(rows.map((r) => r.material_type)),
    cities: unique(rows.map((r) => r.site_city)),
  }), [rows]);

  const filtered = useMemo(() => sortByPriority(rows.filter((r) => {
    const pr = priorities[r.id] ?? null;
    if (filters.priority === "none" && pr) return false;
    if (filters.priority !== "all" && filters.priority !== "none" && pr !== filters.priority) return false;
    if (statusFilter !== "all" && normalizeStatus(r.status) !== statusFilter) return false;
    const text = `${r.request_number} ${r.client_name} ${r.client_company ?? ""} ${r.site_address} ${r.material_type} ${r.dump_name ?? ""}`.toLocaleLowerCase("fr-CA");
    if (filters.search && !text.includes(filters.search.toLocaleLowerCase("fr-CA"))) return false;
    if (filters.dump !== "all" && r.dump_name !== filters.dump) return false;
    if (filters.entrepreneur !== "all" && (r.client_company || r.client_name) !== filters.entrepreneur) return false;
    if (filters.material !== "all" && r.material_type !== filters.material) return false;
    if (filters.city !== "all" && r.site_city !== filters.city) return false;
    if (filters.requestedFrom && r.created_at.slice(0, 10) < filters.requestedFrom) return false;
    if (filters.desiredFrom && (!r.desired_date || r.desired_date < filters.desiredFrom)) return false;
    return true;
  }), priorities), [rows, statusFilter, filters, priorities]);
  const urgentCount = rows.filter((r) => priorities[r.id] === "urgente").length;
  const urgentOnly = filters.priority === "urgente";

  const counts = useMemo(() => Object.fromEntries([
    ["all", rows.length],
    ...ACCESS_STATUSES.map((s) => [s.value, rows.filter((r) => normalizeStatus(r.status) === s.value).length]),
  ]), [rows]);
  const intervention = (counts.nouvelle ?? 0) + (counts.informations_requises ?? 0) + (counts.en_attente_proprietaire ?? 0);
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => key === "search" ? Boolean(value) : Boolean(value && value !== "all")).length;

  if (!isReady || roleLoading) return <FullPageState title="Chargement…" />;
  if (!isAdmin) return <FullPageState title="Accès refusé" message="Réservé aux administrateurs." />;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky-below-nav z-30 border-b border-border bg-card">
        <div className="container mx-auto flex min-h-16 items-center gap-3 px-3 py-3 sm:px-6">
          <Button asChild variant="ghost" size="icon"><Link to="/admin" aria-label="Retour"><ArrowLeft /></Link></Button>
          <div className="min-w-0">
            <h1 className="font-display text-lg font-bold leading-tight sm:text-xl">Demandes d'accès aux dompes</h1>
            <p className="text-xs text-muted-foreground">Centre de gestion · {rows.length} demandes</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 py-4 sm:px-6">
        <section aria-label="Résumé" className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-9">
          <Summary label="Nouvelles" value={counts.nouvelle ?? 0} emphasized />
          <Summary label="Urgentes" value={urgentCount} urgent />
          <Summary label="À intervenir" value={intervention} />
          <Summary label="En analyse" value={counts.en_analyse ?? 0} />
          <Summary label="Infos requises" value={counts.informations_requises ?? 0} />
          <Summary label="Acceptées" value={counts.acceptee ?? 0} />
          <Summary label="Refusées" value={counts.refusee ?? 0} />
          <Summary label="Terminées" value={counts.terminee ?? 0} />
          <Summary label="Annulées" value={counts.annulee ?? 0} />
        </section>

        <AccessRequestStats />

        <section className="mb-4 space-y-3 border-y border-border py-3">
          <div className="md:hidden">
            <label htmlFor="access-status" className="mb-1 block text-xs font-semibold text-muted-foreground">Statut</label>
            <select id="access-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="all">Toutes ({counts.all})</option>
              {ACCESS_STATUSES.filter((s) => !s.hidden || (counts[s.value] ?? 0) > 0).map((s) => <option key={s.value} value={s.value}>{s.label} ({counts[s.value] ?? 0})</option>)}
            </select>
          </div>
          <div className="no-scrollbar hidden gap-1 overflow-x-auto md:flex" role="tablist" aria-label="Statuts">
            <StatusTab label="Toutes" count={counts.all} active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
            {ACCESS_STATUSES.filter((s) => !s.hidden || (counts[s.value] ?? 0) > 0).map((s) => <StatusTab key={s.value} label={s.label} count={counts[s.value] ?? 0} active={statusFilter === s.value} onClick={() => setStatusFilter(s.value)} />)}
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input aria-label="Rechercher une demande" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="No, entrepreneur, chantier, matériau ou dompe" className="pl-9" />
            </div>
            <Button type="button" variant={urgentOnly ? "destructive" : "outline"} aria-pressed={urgentOnly} onClick={() => setFilters({ ...filters, priority: urgentOnly ? "all" : "urgente" })}>
              <AlertCircle /> Urgentes ({urgentCount})
            </Button>
            <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
              <SheetTrigger asChild><Button variant="outline"><Filter /> Filtres{activeFilterCount ? ` (${activeFilterCount})` : ""}</Button></SheetTrigger>
              <SheetContent className="w-full sm:max-w-md">
                <SheetTitle>Filtres</SheetTitle>
                <FilterFields filters={filters} setFilters={setFilters} options={options} />
                <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
                  <Button variant="outline" onClick={() => setFilters(EMPTY_FILTERS)}>Effacer</Button>
                  <Button onClick={() => setFiltersOpen(false)}>Afficher {filtered.length}</Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
          {activeFilterCount > 0 && <p className="text-xs text-muted-foreground">{activeFilterCount} filtre{activeFilterCount > 1 ? "s" : ""} actif{activeFilterCount > 1 ? "s" : ""} · {filtered.length} résultat{filtered.length > 1 ? "s" : ""}</p>}
        </section>

        {loading ? <FullPageState title="Chargement…" /> : filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Aucune demande ne correspond à ces filtres.</p>
        ) : <>
          <div className="grid gap-3 md:hidden">
            {filtered.map((r) => <RequestCard key={r.id} request={r} priority={priorities[r.id] ?? null} onOpen={() => void openDetail(r)} />)}
          </div>
          <div className="table-scroll hidden rounded-md border border-border md:block">
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>
                {['No demande', 'Entrepreneur', 'Chantier', 'Matériau', 'Quantité', 'Dompe demandée', 'Date demandée', 'Statut', 'Priorité', 'Action'].map((h) => <th key={h} className="px-3 py-3 text-left font-semibold">{h}</th>)}
              </tr></thead>
              <tbody>{filtered.map((r) => <tr key={r.id} className={`border-t border-border align-top ${priorities[r.id] === "urgente" ? "border-l-4 border-l-destructive" : ""}`}>
                <td className="px-3 py-3 font-bold">{r.request_number}</td>
                <td className="max-w-44 px-3 py-3"><b className="block break-words">{r.client_company || r.client_name}</b>{r.client_company && <span className="text-xs text-muted-foreground">{r.client_name}</span>}</td>
                <td className="max-w-56 px-3 py-3 break-words">{r.site_address}</td>
                <td className="px-3 py-3 capitalize">{r.material_other || r.material_type}</td>
                <td className="px-3 py-3">{quantity(r)}</td>
                <td className="max-w-44 px-3 py-3 break-words">{r.dump_name || "À confirmer"}{r.distance_km != null && <span className="block text-xs text-muted-foreground">{r.distance_km} km</span>}</td>
                <td className="px-3 py-3">{formatDate(r.desired_date || r.created_at)}</td>
                <td className="px-3 py-3"><StatusBadge status={r.status} /></td>
                <td className="px-3 py-3"><PriorityBadge priority={priorities[r.id] ?? null} /></td>
                <td className="px-3 py-3"><Button variant="outline" size="sm" onClick={() => void openDetail(r)}>Voir</Button></td>
              </tr>)}</tbody>
            </table>
          </div>
        </>}
      </main>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-xl">
          {selected && <RequestDetail request={selected} priority={priorities[selected.id] ?? null} onPriority={updatePriority} history={history} onStatus={updateStatus} onNotes={updateNotes} onOwnerContacted={updateOwnerContacted} />}
        </SheetContent>
      </Sheet>
    </div>
  );
};

const Summary = ({ label, value, emphasized, urgent }: { label: string; value: number; emphasized?: boolean; urgent?: boolean }) => <div className={`rounded-md border px-3 py-3 ${urgent && value > 0 ? "border-destructive/50 bg-destructive/5" : emphasized && value > 0 ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}><strong className="block text-xl leading-none">{value}</strong><span className="mt-1 block text-xs text-muted-foreground">{label}</span></div>;

const StatusTab = ({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) => <Button type="button" role="tab" aria-selected={active} variant={active ? "default" : "ghost"} size="sm" className="shrink-0" onClick={onClick}>{label} <span className="opacity-70">{count}</span></Button>;

function RequestCard({ request: r, priority, onOpen }: { request: AccessRequest; priority: AccessPriority | null; onOpen: () => void }) {
  return <article className={`rounded-md border bg-card p-4 ${priority === "urgente" ? "border-destructive/60 border-l-4 border-l-destructive" : "border-border"}`}>
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs text-muted-foreground">Demande</p><h2 className="font-display font-bold">{r.request_number}</h2></div><div className="flex flex-wrap gap-1.5"><PriorityBadge priority={priority} /><StatusBadge status={r.status} /></div></div>
    <p className="mt-3 font-semibold break-words">{r.client_company || r.client_name}</p><p className="text-sm text-muted-foreground break-words">{r.site_address}</p>
    <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
      <Info label="Matériau" value={r.material_other || r.material_type} />
      <Info label="Quantité" value={quantity(r)} />
      <Info label="Dompe" value={r.dump_name || "À confirmer"} />
      <Info label="Date demandée" value={formatDate(r.desired_date || r.created_at)} />
    </dl>
    <Button className="mt-4 w-full" onClick={onOpen}>Voir la demande</Button>
  </article>;
}

function RequestDetail({ request: r, priority, onPriority, history, onStatus, onNotes, onOwnerContacted }: { request: AccessRequest; priority: AccessPriority | null; onPriority: (p: AccessPriority) => void; history: HistoryEntry[]; onStatus: (status: string) => void; onNotes: (notes: string) => void; onOwnerContacted: (contacted: boolean) => void }) {
  const alternatives = Array.isArray(r.alternative_dumps) ? r.alternative_dumps : [];
  return <>
    <div className="sticky top-0 z-10 border-b border-border bg-background px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] pr-14">
      <p className="text-xs text-muted-foreground">Demande d'accès</p><h2 className="font-display text-lg font-bold">{r.request_number}</h2>
      <div className="mt-2 flex flex-wrap gap-2"><StatusBadge status={r.status} /><PriorityBadge priority={priority} /></div>
      <label htmlFor="access-priority" className="mt-3 block text-xs font-bold text-muted-foreground">Priorité</label>
      <select id="access-priority" value={priority ?? ""} onChange={(e) => e.target.value && onPriority(e.target.value as AccessPriority)} className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm sm:w-56">
        {!priority && <option value="">Non définie — choisir</option>}
        {ACCESS_PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>
    </div>
    <div className="space-y-5 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <section><SectionTitle number="1" title="Résumé" /><InfoGrid items={[["Numéro", r.request_number], ["Créée", formatDateTime(r.created_at)], ["Statut", statusLabel(r.status)], ["Date souhaitée", formatDate(r.desired_date)], ["Priorité", priorityLabel(priority)]]} /></section>
      <section><SectionTitle number="2" title="Entrepreneur" /><InfoGrid items={[["Nom", r.client_name], ["Entreprise", r.client_company || "—"]]} /><div className="mt-2 flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><a href={`tel:${r.client_phone}`}><Phone />{r.client_phone}</a></Button>{r.client_email && <Button asChild variant="outline" size="sm"><a href={`mailto:${r.client_email}`}><Mail />Courriel</a></Button>}</div></section>
      <section><SectionTitle number="3" title="Chantier" /><p className="flex items-start gap-2 text-sm"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"/><span className="break-words">{r.site_address}</span></p>{r.site_city && <p className="mt-1 text-sm text-muted-foreground">{r.site_city}</p>}{r.site_latitude != null && r.site_longitude != null && <Button asChild variant="link" size="sm" className="px-0"><a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${r.site_latitude},${r.site_longitude}`}>Ouvrir la localisation</a></Button>}</section>
      <section><SectionTitle number="4" title="Besoin" /><InfoGrid items={[["Matériau", r.material_other || r.material_type], ["Quantité", quantity(r)], ["Camion", r.truck_type || "—"], ["Voyages", r.estimated_trips?.toString() || "—"], ["Date souhaitée", formatDate(r.desired_date)], ["Heure", r.desired_time || "—"]]} />{r.client_notes && <p className="mt-3 whitespace-pre-line rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">{r.client_notes}</p>}</section>
      <section><SectionTitle number="5" title="Dompe" /><InfoGrid items={[["Dompe demandée", r.dump_name || "À confirmer"], ["Distance", r.distance_km != null ? `${r.distance_km} km` : "Distance à confirmer"], ["Temps estimé", r.travel_time_minutes != null ? `${r.travel_time_minutes} min` : "—"], ["Accès", statusLabel(r.status)], ["Compatibilité", "Non renseignée"]]} />{alternatives.length > 0 && <div className="mt-3"><p className="mb-1 text-xs font-semibold text-muted-foreground">Alternatives enregistrées</p>{alternatives.map((d, index) => <p key={index} className="text-sm">{String(d.name ?? d.dump_name ?? "Dompe")}</p>)}</div>}</section>
      <section><SectionTitle number="6" title="Historique" /><ol className="relative ml-2 space-y-4 border-l border-border pl-5"><li><span className="absolute -left-1.5 h-3 w-3 rounded-full border-2 border-background bg-muted-foreground"/><p className="text-sm font-semibold">Demande créée</p><p className="text-xs text-muted-foreground">{formatDateTime(r.created_at)}</p></li>{history.map((h) => <li key={h.id} className="relative"><span className="absolute -left-[1.6rem] top-1 h-3 w-3 rounded-full border-2 border-background bg-primary"/><p className="text-sm font-semibold">{FIELD_LABELS[h.field_key] || h.field_key}</p><p className="text-xs text-muted-foreground">{formatHistoryVal(h.field_key, h.old_value)} → {formatHistoryVal(h.field_key, h.new_value)}</p><p className="text-xs text-muted-foreground">{formatDateTime(h.created_at)}{h.user_email ? ` · ${h.user_email}` : ""}</p></li>)}</ol></section>
      <section><SectionTitle number="7" title="Traitement" /><div className="grid grid-cols-1 gap-2 min-[390px]:grid-cols-2"><Button onClick={() => onStatus("acceptee")}><Check />Accepter</Button><Button variant="outline" onClick={() => onStatus("en_analyse")}><Clock />Mettre en analyse</Button><Button variant="outline" onClick={() => onStatus("informations_requises")}><AlertCircle />Demander des informations</Button><Button variant="destructive" onClick={() => onStatus("refusee")}><XCircle />Refuser</Button></div><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="mt-2 w-full"><CircleEllipsis />Plus<ChevronDown /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-64"><DropdownMenuItem onSelect={() => onStatus("terminee")}>Marquer terminée</DropdownMenuItem><DropdownMenuItem onSelect={() => onStatus("annulee")}>Marquer annulée</DropdownMenuItem><DropdownMenuItem onSelect={() => onOwnerContacted(!r.owner_contacted)}>{r.owner_contacted ? "Annuler le contact propriétaire" : "Propriétaire contacté"}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></section>
      <section><label htmlFor="internal-notes" className="mb-1 block text-xs font-bold text-muted-foreground">Notes internes</label><textarea id="internal-notes" defaultValue={r.internal_notes || ""} onBlur={(e) => void onNotes(e.target.value)} rows={4} className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-base sm:text-sm" placeholder="Ajouter une note…" /></section>
    </div>
  </>;
}

function FilterFields({ filters, setFilters, options }: { filters: Filters; setFilters: (next: Filters) => void; options: { dumps: string[]; entrepreneurs: string[]; materials: string[]; cities: string[] } }) {
  return <div className="space-y-3"><label className="block text-sm font-semibold">Priorité<select value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })} className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="all">Toutes</option>{ACCESS_PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}<option value="none">Non définie</option></select></label><FilterSelect label="Dompe" value={filters.dump} options={options.dumps} onChange={(dump) => setFilters({ ...filters, dump })}/><FilterSelect label="Entrepreneur" value={filters.entrepreneur} options={options.entrepreneurs} onChange={(entrepreneur) => setFilters({ ...filters, entrepreneur })}/><FilterSelect label="Matériau" value={filters.material} options={options.materials} onChange={(material) => setFilters({ ...filters, material })}/><FilterSelect label="Ville / territoire" value={filters.city} options={options.cities} onChange={(city) => setFilters({ ...filters, city })}/><label className="block text-sm font-semibold">Date de demande, depuis<Input type="date" value={filters.requestedFrom} onChange={(e) => setFilters({ ...filters, requestedFrom: e.target.value })} className="mt-1"/></label><label className="block text-sm font-semibold">Date souhaitée, depuis<Input type="date" value={filters.desiredFrom} onChange={(e) => setFilters({ ...filters, desiredFrom: e.target.value })} className="mt-1"/></label><p className="text-xs text-muted-foreground">Le statut se choisit dans les onglets au-dessus de la liste.</p></div>;
}

const FilterSelect = ({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) => <label className="block text-sm font-semibold">{label}<select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="all">Tous</option>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
const SectionTitle = ({ number, title }: { number: string; title: string }) => <h3 className="mb-3 flex items-center gap-2 font-display font-bold"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-xs">{number}</span>{title}</h3>;
const InfoGrid = ({ items }: { items: Array<[string, string]> }) => <dl className="grid grid-cols-1 gap-3 rounded-md border border-border bg-card p-3 min-[390px]:grid-cols-2">{items.map(([label, value]) => <Info key={label} label={label} value={value}/>)}</dl>;
const Info = ({ label, value }: { label: string; value: string }) => <div className="min-w-0"><dt className="text-xs font-semibold text-muted-foreground">{label}</dt><dd className="break-words text-sm">{value}</dd></div>;
const StatusBadge = ({ status }: { status: string }) => <Badge variant={normalizeStatus(status) === "nouvelle" ? "default" : normalizeStatus(status) === "refusee" ? "destructive" : "secondary"} className="max-w-full whitespace-normal text-left">{statusLabel(status)}</Badge>;
const PriorityBadge = ({ priority }: { priority: AccessPriority | null }) => priority === "urgente"
  ? <Badge variant="destructive" className="font-bold tracking-wide">URGENT</Badge>
  : priority === "prioritaire" ? <Badge className="bg-foreground text-background hover:bg-foreground">Prioritaire</Badge>
  : <Badge variant="outline" className="whitespace-normal text-muted-foreground">{priority ? "Normale" : "Non définie"}</Badge>;
const unique = (values: Array<string | null>) => [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "fr-CA"));
const quantity = (r: AccessRequest) => r.quantity != null ? `${r.quantity} ${r.quantity_unit || ""}`.trim() : "À confirmer";
const formatDate = (value: string | null) => value ? new Date(value.includes("T") ? value : `${value}T12:00:00`).toLocaleDateString("fr-CA", { day: "numeric", month: "short", year: "numeric" }) : "À confirmer";
const formatDateTime = (value: string) => new Date(value).toLocaleString("fr-CA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const FIELD_LABELS: Record<string, string> = { priority: "Priorité modifiée", created: "Demande créée", status: "Statut modifié", internal_notes: "Note interne", owner_contacted: "Propriétaire contacté", owner_contacted_at: "Date de contact du propriétaire", assigned_dispatcher: "Responsable assigné", driver_id: "Chauffeur assigné", truck_id: "Camion assigné", desired_date: "Date souhaitée", desired_time: "Heure souhaitée", dump_name: "Dompe sélectionnée" };
const formatHistoryVal = (field: string, value: unknown) => field === "priority" ? (value ? ACCESS_PRIORITIES.find((p) => p.value === value)?.label ?? formatVal(value) : "Non définie") : field === "status" ? statusLabel(formatVal(value)) : field === "owner_contacted" ? (formatVal(value) === "true" ? "Oui" : "Non") : formatVal(value);
const formatVal = (value: unknown) => value == null ? "—" : typeof value === "string" ? value.replace(/^"|"$/g, "") : JSON.stringify(value);

export default AdminTransportRequests;