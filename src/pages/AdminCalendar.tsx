import { useEffect, useMemo, useState } from "react";
import { markVoluntarySignOut } from "@/lib/navigation/returnTo";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/useUserRole";
import { useAuthReady } from "@/hooks/useAuthReady";
import FullPageState from "@/components/FullPageState";
import TransportBanner from "@/components/TransportBanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Plus, ChevronLeft, ChevronRight, CalendarDays, Truck as TruckIcon,
  Users, Settings, Filter as FilterIcon, X, Menu, LogOut, Database as DatabaseIcon,
} from "lucide-react";
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, addWeeks, addMonths,
  isSameDay, format, eachDayOfInterval, startOfDay, endOfDay, isToday,
} from "date-fns";
import { fr } from "date-fns/locale";
import {
  CalendarEvent, Truck, Driver, CalendarView, VIEW_LABELS, EVENT_STATUSES, STATUS_LABELS,
  TRUCK_TYPE_LABELS, statusBg,
} from "@/lib/calendar-utils";
import EventModal, { EventDraft } from "@/components/calendar/EventModal";
import EventBlock from "@/components/calendar/EventBlock";
import FleetManager from "@/components/calendar/FleetManager";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";

type EntrepreneurLite = { id: string; name: string; company: string | null };

export default function AdminCalendar() {
  const navigate = useNavigate();
  const { user, isReady } = useAuthReady();
  const { isAdmin, loading: roleLoading } = useUserRoles(user, isReady);
  const [searchParams, setSearchParams] = useSearchParams();

  const [view, setView] = useState<CalendarView>(() => {
    if (typeof window !== "undefined" && window.innerWidth < 640) return "day";
    return "week";
  });
  const [cursor, setCursor] = useState<Date>(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [entrepreneurs, setEntrepreneurs] = useState<EntrepreneurLite[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EventDraft | null>(null);
  const [fleetOpen, setFleetOpen] = useState<null | "trucks" | "drivers">(null);

  const [filters, setFilters] = useState({
    entrepreneur: "", driver: "", truck: "", dompe: "", status: "", material: "",
  });
  const [showFilters, setShowFilters] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    markVoluntarySignOut(); await supabase.auth.signOut();
    navigate("/login");
  };

  useEffect(() => {
    if (!isReady || roleLoading) return;
    if (!user || !isAdmin) navigate("/login", { replace: true });
  }, [isReady, roleLoading, user, isAdmin, navigate]);

  const loadAll = async () => {
    const [ev, tr, dr, en] = await Promise.all([
      supabase.from("calendar_events").select("*").order("start_at", { ascending: true }),
      supabase.from("trucks").select("*").order("name"),
      supabase.from("drivers").select("*").order("name"),
      supabase.from("entrepreneurs").select("id,name,company").order("name"),
    ]);
    setEvents((ev.data as CalendarEvent[]) || []);
    setTrucks((tr.data as Truck[]) || []);
    setDrivers((dr.data as Driver[]) || []);
    setEntrepreneurs((en.data as EntrepreneurLite[]) || []);
  };

  useEffect(() => { if (isAdmin) loadAll(); }, [isAdmin]);

  // Realtime
  useEffect(() => {
    if (!isAdmin) return;
    const ch = supabase
      .channel(`calendar_events_rt-` + Math.random().toString(36).slice(2))
      .on("postgres_changes", { event: "*", schema: "public", table: "calendar_events" }, () => loadAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isAdmin]);

  // Pré-remplissage depuis l'URL (depuis CRM)
  useEffect(() => {
    const sid = searchParams.get("from_submission");
    if (!sid || !isAdmin) return;
    (async () => {
      const { data } = await supabase.from("submissions").select("*").eq("id", sid).maybeSingle();
      if (!data) return;
      setEditing({
        title: `Livraison — ${data.name || data.dompe_number || "client"}`,
        submission_id: data.id,
        dompe_number: data.dompe_number || "",
        dompe_address: data.address || "",
        delivery_address: data.address || "",
        material_type: (data.materials && data.materials[0]) || data.other_material || "",
        client_name: data.name || "",
        trips_planned: data.tonnage ? null : null,
        admin_notes: data.description || "",
      });
      setModalOpen(true);
      searchParams.delete("from_submission");
      setSearchParams(searchParams, { replace: true });
    })();
  }, [searchParams, isAdmin]);

  const trucksById = useMemo(() => new Map(trucks.map((t) => [t.id, t])), [trucks]);
  const driversById = useMemo(() => new Map(drivers.map((d) => [d.id, d])), [drivers]);
  const entreById = useMemo(() => new Map(entrepreneurs.map((e) => [e.id, e])), [entrepreneurs]);

  const filtered = useMemo(() => events.filter((e) => {
    if (filters.entrepreneur && e.entrepreneur_id !== filters.entrepreneur) return false;
    if (filters.driver && e.driver_id !== filters.driver) return false;
    if (filters.truck && e.truck_id !== filters.truck) return false;
    if (filters.status && e.status !== filters.status) return false;
    if (filters.dompe && !(e.dompe_number || "").toLowerCase().includes(filters.dompe.toLowerCase())) return false;
    if (filters.material && !(e.material_type || "").toLowerCase().includes(filters.material.toLowerCase())) return false;
    return true;
  }), [events, filters]);

  const range = useMemo(() => {
    if (view === "day") return { from: startOfDay(cursor), to: endOfDay(cursor) };
    if (view === "week") return { from: startOfWeek(cursor, { weekStartsOn: 1 }), to: endOfWeek(cursor, { weekStartsOn: 1 }) };
    if (view === "month") return { from: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }), to: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }) };
    if (view === "agenda") return { from: startOfDay(cursor), to: endOfDay(addDays(cursor, 30)) };
    return { from: startOfDay(cursor), to: endOfDay(cursor) };
  }, [view, cursor]);

  const inRange = useMemo(() => filtered.filter((e) => {
    const t = new Date(e.start_at).getTime();
    return t >= range.from.getTime() && t <= range.to.getTime();
  }), [filtered, range]);

  const onSlotClick = (d: Date) => {
    const start = new Date(d);
    start.setHours(8, 0, 0, 0);
    setEditing({ start_at: start.toISOString(), title: "" });
    setModalOpen(true);
  };

  const onEventClick = (e: CalendarEvent) => {
    setEditing(e);
    setModalOpen(true);
  };

  const navStep = (dir: -1 | 1) => {
    setCursor((c) => view === "day" ? addDays(c, dir)
      : view === "week" ? addWeeks(c, dir)
      : view === "month" ? addMonths(c, dir)
      : addDays(c, dir * 7));
  };

  if (!isReady || roleLoading) {
    return <FullPageState title="Connexion en cours" message="Le calendrier se charge." />;
  }
  if (!user || !isAdmin) return null;

  const cursorLabel = view === "month"
    ? format(cursor, "LLLL yyyy", { locale: fr })
    : view === "week"
    ? `${format(range.from, "d MMM", { locale: fr })} — ${format(range.to, "d MMM yyyy", { locale: fr })}`
    : format(cursor, "EEEE d MMMM yyyy", { locale: fr });

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border bg-card">
        <div className="container mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <Link to="/admin" className="flex items-center gap-2 text-sm font-display font-semibold text-muted-foreground hover:text-foreground min-w-0">
            <ArrowLeft className="w-4 h-4 shrink-0" /> <span className="hidden sm:inline">Retour à l'admin</span>
          </Link>
          <h1 className="font-display font-bold flex items-center gap-2 text-sm sm:text-base"><CalendarDays className="w-5 h-5 text-primary" /> Calendrier</h1>

          {/* Mobile hamburger */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button className="sm:hidden p-2 rounded-md hover:bg-secondary/80 -mr-2" aria-label="Menu">
                <Menu className="w-5 h-5 text-foreground" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[280px] sm:w-72">
              <SheetTitle className="sr-only">Menu de navigation</SheetTitle>
              <div className="flex flex-col gap-1 mt-6">
                <div className="px-3 py-2 text-xs font-display font-bold uppercase text-muted-foreground tracking-wide">Navigation</div>
                <Link to="/admin" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-body text-foreground hover:bg-secondary">
                  <ArrowLeft className="w-4 h-4" /> Demandes (CRM)
                </Link>
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-body bg-primary text-primary-foreground font-semibold">
                  <CalendarDays className="w-4 h-4" /> Calendrier
                </div>
                <Link to="/admin/donnees" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-body text-foreground hover:bg-secondary">
                  <DatabaseIcon className="w-4 h-4" /> Données
                </Link>
                <div className="border-t border-border my-2" />
                <button onClick={() => { setMobileOpen(false); handleLogout(); }} className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-body text-muted-foreground hover:text-foreground hover:bg-secondary">
                  <LogOut className="w-4 h-4" /> Déconnexion
                </button>
              </div>
            </SheetContent>
          </Sheet>

          {/* Desktop quick links */}
          <div className="hidden sm:flex items-center gap-3">
            <Link to="/admin/donnees" className="text-sm text-muted-foreground hover:text-foreground font-body">Données</Link>
            <button onClick={handleLogout} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground font-body">
              <LogOut className="w-4 h-4" /> Déconnexion
            </button>
          </div>
        </div>
      </nav>
      <TransportBanner />

      <main className="container mx-auto px-3 sm:px-6 py-6">
        <DailyDashboard events={filtered} trucksById={trucksById} driversById={driversById} />

        {/* Toolbar */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
            <Button variant="ghost" size="icon" onClick={() => navStep(-1)} className="h-8 w-8"><ChevronLeft className="w-4 h-4" /></Button>
            <Button variant="ghost" size="sm" className="h-8 px-3 font-display" onClick={() => setCursor(new Date())}>Aujourd'hui</Button>
            <Button variant="ghost" size="icon" onClick={() => navStep(1)} className="h-8 w-8"><ChevronRight className="w-4 h-4" /></Button>
          </div>
          <div className="text-sm sm:text-base font-display font-semibold capitalize">{cursorLabel}</div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex max-w-full flex-wrap items-center gap-0.5 rounded-lg bg-secondary p-0.5">
              {(Object.keys(VIEW_LABELS) as CalendarView[]).map((v) => (
                <button key={v} onClick={() => setView(v)}
                  className={`min-h-9 rounded-md px-2.5 py-1.5 text-xs font-display font-semibold sm:px-3 sm:text-sm ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {VIEW_LABELS[v]}
                </button>
              ))}
            </div>

            <Button variant="outline" size="sm" onClick={() => setShowFilters((s) => !s)}>
              <FilterIcon className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline">Filtres</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setFleetOpen("trucks")}>
              <TruckIcon className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline">Camions</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setFleetOpen("drivers")}>
              <Users className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline">Chauffeurs</span>
            </Button>
            <Button size="sm" onClick={() => { setEditing(null); setModalOpen(true); }}>
              <Plus className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline">Planifier une livraison</span><span className="sm:hidden">Planifier</span>
            </Button>
          </div>
        </div>

        {showFilters && (
          <FiltersBar
            filters={filters} setFilters={setFilters}
            trucks={trucks} drivers={drivers} entrepreneurs={entrepreneurs}
            onClose={() => setShowFilters(false)}
          />
        )}

        {/* View */}
        <div className="mt-4">
          {view === "month" && <MonthGrid cursor={cursor} events={inRange} trucksById={trucksById} driversById={driversById} onSlot={onSlotClick} onEvent={onEventClick} />}
          {view === "week" && <WeekGrid range={range} events={inRange} trucksById={trucksById} driversById={driversById} onSlot={onSlotClick} onEvent={onEventClick} />}
          {view === "day" && <DayList day={cursor} events={inRange} trucksById={trucksById} driversById={driversById} onEvent={onEventClick} onSlot={onSlotClick} />}
          {view === "agenda" && <AgendaList events={inRange} trucksById={trucksById} driversById={driversById} entreById={entreById} onEvent={onEventClick} />}
          {view === "dispatch" && <DispatchTable events={inRange} trucksById={trucksById} driversById={driversById} entreById={entreById} onEvent={onEventClick} />}
        </div>
      </main>

      <EventModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        initial={editing}
        trucks={trucks}
        drivers={drivers}
        entrepreneurs={entrepreneurs}
        onSaved={loadAll}
      />
      <FleetManager
        open={!!fleetOpen}
        onOpenChange={(v) => setFleetOpen(v ? (fleetOpen ?? "trucks") : null)}
        tab={fleetOpen || "trucks"}
        trucks={trucks}
        drivers={drivers}
        onChanged={loadAll}
      />
    </div>
  );
}

/* ---------- Dashboard ---------- */
function DailyDashboard({ events, trucksById, driversById }: {
  events: CalendarEvent[]; trucksById: Map<string, Truck>; driversById: Map<string, Driver>;
}) {
  const today = new Date();
  const wkStart = startOfWeek(today, { weekStartsOn: 1 });
  const wkEnd = endOfWeek(today, { weekStartsOn: 1 });

  const todays = events.filter((e) => isSameDay(new Date(e.start_at), today));
  const week = events.filter((e) => {
    const t = new Date(e.start_at).getTime();
    return t >= wkStart.getTime() && t <= wkEnd.getTime();
  });

  const sumTrips = (arr: CalendarEvent[]) => arr.reduce((s, e) => s + (e.trips_planned || 0), 0);
  const uniq = (arr: (string | null)[]) => new Set(arr.filter(Boolean) as string[]).size;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <Stat label="Livraisons aujourd'hui" value={todays.length} />
      <Stat label="Voyages aujourd'hui" value={sumTrips(todays)} />
      <Stat label="Dompes actives" value={uniq(todays.map((e) => e.dompe_number))} />
      <Stat label="Camions en op." value={uniq(todays.map((e) => e.truck_id))} />
      <Stat label="Chauffeurs en op." value={uniq(todays.map((e) => e.driver_id))} />
      <Stat label="Cette semaine" value={`${week.length} liv. • ${sumTrips(week)} voy.`} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <div className="text-xs font-display text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-lg sm:text-xl font-display font-bold text-foreground mt-1">{value}</div>
    </div>
  );
}

/* ---------- Filters ---------- */
function FiltersBar({ filters, setFilters, trucks, drivers, entrepreneurs, onClose }: any) {
  const upd = (k: string, v: string) => setFilters((f: any) => ({ ...f, [k]: v === "_all" ? "" : v }));
  return (
    <div className="mt-3 bg-card border border-border rounded-lg p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 relative">
      <button onClick={onClose} className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
      <SelectFilter label="Entrepreneur" value={filters.entrepreneur} onChange={(v) => upd("entrepreneur", v)} options={entrepreneurs.map((e: any) => ({ value: e.id, label: e.company || e.name }))} />
      <SelectFilter label="Chauffeur" value={filters.driver} onChange={(v) => upd("driver", v)} options={drivers.map((d: Driver) => ({ value: d.id, label: d.name }))} />
      <SelectFilter label="Camion" value={filters.truck} onChange={(v) => upd("truck", v)} options={trucks.map((t: Truck) => ({ value: t.id, label: `${t.name} (${TRUCK_TYPE_LABELS[t.type]})` }))} />
      <SelectFilter label="Statut" value={filters.status} onChange={(v) => upd("status", v)} options={EVENT_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))} />
      <div className="space-y-1">
        <label className="text-xs font-display text-muted-foreground">Dompe</label>
        <Input value={filters.dompe} onChange={(e) => setFilters((f: any) => ({ ...f, dompe: e.target.value }))} placeholder="N°" />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-display text-muted-foreground">Matériel</label>
        <Input value={filters.material} onChange={(e) => setFilters((f: any) => ({ ...f, material: e.target.value }))} placeholder="Type" />
      </div>
    </div>
  );
}

function SelectFilter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-display text-muted-foreground">{label}</label>
      <Select value={value || "_all"} onValueChange={onChange}>
        <SelectTrigger className="h-9"><SelectValue placeholder="Tous" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">Tous</SelectItem>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

/* ---------- Month ---------- */
function MonthGrid({ cursor, events, trucksById, driversById, onSlot, onEvent }: any) {
  const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start, end });
  const month = cursor.getMonth();
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="grid grid-cols-7 bg-secondary text-xs font-display font-semibold uppercase">
        {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
          <div key={d} className="p-2 text-center text-muted-foreground">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const dayEvents = events.filter((e: CalendarEvent) => isSameDay(new Date(e.start_at), d));
          return (
            <div key={d.toISOString()}
              className={`min-h-[110px] border-t border-l border-border p-1.5 ${d.getMonth() !== month ? "bg-muted/30 text-muted-foreground" : ""}`}>
              <button onClick={() => onSlot(d)} className={`text-xs font-display font-semibold w-6 h-6 rounded-full flex items-center justify-center mb-1 ${isToday(d) ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>
                {d.getDate()}
              </button>
              <div className="space-y-1">
                {dayEvents.slice(0, 3).map((e: CalendarEvent) => (
                  <EventBlock key={e.id} event={e} trucksById={trucksById} driversById={driversById} onClick={() => onEvent(e)} compact />
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-muted-foreground pl-1">+{dayEvents.length - 3} de plus</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Week ---------- */
function WeekGrid({ range, events, trucksById, driversById, onSlot, onEvent }: any) {
  const days = eachDayOfInterval({ start: range.from, end: range.to });
  return (
    <div className="bg-card border border-border rounded-lg overflow-x-auto">
      <div className="grid grid-cols-7 min-w-[700px]">
        {days.map((d) => {
          const dayEvents = events
            .filter((e: CalendarEvent) => isSameDay(new Date(e.start_at), d))
            .sort((a: CalendarEvent, b: CalendarEvent) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
          return (
            <div key={d.toISOString()} className="border-l border-border min-h-[400px]">
              <button onClick={() => onSlot(d)} className={`w-full text-center py-2 border-b border-border ${isToday(d) ? "bg-primary/10" : "bg-secondary"} hover:opacity-90`}>
                <div className="text-[10px] uppercase font-display font-semibold text-muted-foreground">{format(d, "EEE", { locale: fr })}</div>
                <div className={`text-base font-display font-bold ${isToday(d) ? "text-primary" : "text-foreground"}`}>{d.getDate()}</div>
              </button>
              <div className="p-1.5 space-y-1.5">
                {dayEvents.length === 0 && (
                  <button onClick={() => onSlot(d)} className="w-full text-[11px] text-muted-foreground py-4 hover:text-foreground">+ Ajouter</button>
                )}
                {dayEvents.map((e: CalendarEvent) => (
                  <EventBlock key={e.id} event={e} trucksById={trucksById} driversById={driversById} onClick={() => onEvent(e)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Day ---------- */
function DayList({ day, events, trucksById, driversById, onEvent, onSlot }: any) {
  const dayEvents = events
    .filter((e: CalendarEvent) => isSameDay(new Date(e.start_at), day))
    .sort((a: CalendarEvent, b: CalendarEvent) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-2">
      {dayEvents.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-3">Aucune livraison ce jour.</p>
          <Button onClick={() => onSlot(day)}><Plus className="w-4 h-4 mr-1" /> Planifier</Button>
        </div>
      )}
      {dayEvents.map((e: CalendarEvent) => (
        <EventBlock key={e.id} event={e} trucksById={trucksById} driversById={driversById} onClick={() => onEvent(e)} />
      ))}
    </div>
  );
}

/* ---------- Agenda ---------- */
function AgendaList({ events, trucksById, driversById, entreById, onEvent }: any) {
  const sorted = [...events].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  const grouped = new Map<string, CalendarEvent[]>();
  sorted.forEach((e) => {
    const k = format(new Date(e.start_at), "yyyy-MM-dd");
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k)!.push(e);
  });
  if (grouped.size === 0) {
    return <div className="bg-card border border-border rounded-lg p-12 text-center text-muted-foreground">Aucune livraison dans cette plage.</div>;
  }
  return (
    <div className="space-y-4">
      {[...grouped.entries()].map(([k, arr]) => (
        <div key={k} className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="bg-secondary px-3 py-2 text-sm font-display font-bold capitalize">
            {format(new Date(k), "EEEE d MMMM yyyy", { locale: fr })}
          </div>
          <div className="divide-y divide-border">
            {arr.map((e) => {
              const truck = e.truck_id ? trucksById.get(e.truck_id) : null;
              const driver = e.driver_id ? driversById.get(e.driver_id) : null;
              const ent = e.entrepreneur_id ? entreById.get(e.entrepreneur_id) : null;
              return (
                <button key={e.id} onClick={() => onEvent(e)} className="w-full text-left p-3 hover:bg-secondary/50 flex gap-3 items-start">
                  <div className="w-1 self-stretch rounded-full" style={{ background: statusBg(e.status) }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-semibold text-sm">
                      {format(new Date(e.start_at), "HH:mm")} — {e.title}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                      {e.dompe_number && <span>Dompe {e.dompe_number}</span>}
                      {truck && <span>{TRUCK_TYPE_LABELS[truck.type]} — {truck.name}</span>}
                      {driver && <span>{driver.name}</span>}
                      {ent && <span>{ent.company || ent.name}</span>}
                      {e.trips_planned ? <span>{e.trips_planned} voyages</span> : null}
                    </div>
                  </div>
                  <span className="text-[10px] uppercase font-display font-bold px-2 py-0.5 rounded-full text-white shrink-0" style={{ background: statusBg(e.status) }}>
                    {STATUS_LABELS[e.status]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Dispatch table ---------- */
function DispatchTable({ events, trucksById, driversById, entreById, onEvent }: any) {
  const sorted = [...events].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  return (
    <div className="bg-card border border-border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-secondary">
          <tr className="text-left">
            {["Date", "Heure", "Camion", "Chauffeur", "Dompe", "Adresse", "Voyages", "Statut"].map((h) => (
              <th key={h} className="px-3 py-2 font-display font-bold text-xs uppercase text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Aucun transport planifié.</td></tr>
          )}
          {sorted.map((e) => {
            const truck = e.truck_id ? trucksById.get(e.truck_id) : null;
            const driver = e.driver_id ? driversById.get(e.driver_id) : null;
            const ent = e.entrepreneur_id ? entreById.get(e.entrepreneur_id) : null;
            return (
              <tr key={e.id} onClick={() => onEvent(e)} className="border-t border-border cursor-pointer hover:bg-secondary/40">
                <td className="px-3 py-2 font-body whitespace-nowrap">{format(new Date(e.start_at), "d MMM", { locale: fr })}</td>
                <td className="px-3 py-2 font-body whitespace-nowrap">{format(new Date(e.start_at), "HH:mm")}</td>
                <td className="px-3 py-2 font-body">{truck ? `${TRUCK_TYPE_LABELS[truck.type]} — ${truck.name}` : "—"}</td>
                <td className="px-3 py-2 font-body">{driver?.name || "—"}</td>
                <td className="px-3 py-2 font-body">{e.dompe_number || "—"}</td>
                <td className="px-3 py-2 font-body max-w-[260px] truncate">{e.delivery_address || e.dompe_address || (ent?.company || ent?.name) || "—"}</td>
                <td className="px-3 py-2 font-body">{e.trips_planned ?? "—"}</td>
                <td className="px-3 py-2 font-body">
                  <span className="inline-block text-[10px] uppercase font-display font-bold px-2 py-0.5 rounded-full text-white" style={{ background: statusBg(e.status) }}>
                    {STATUS_LABELS[e.status]}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}