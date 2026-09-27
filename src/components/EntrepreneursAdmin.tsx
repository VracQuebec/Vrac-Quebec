import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, X, Save, User as UserIcon, Building2, Mail, Phone, Calendar, Briefcase, Truck, Plus, FileText, Receipt, Trash2, Search, SlidersHorizontal, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import VisibilityAuditList from "@/components/admin/VisibilityAuditList";
import { PAYMENT_STATUSES, PAYMENT_METHODS, findPaymentStatus, computeTaxes, isMaterialTaxableByDefault, type LeadTrip } from "@/lib/billing";

type RoleRow = { user_id: string; email: string; roles: string[]; approved: boolean; created_at: string };
type EntrepreneurRow = {
  id: string;
  user_id: string | null;
  name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  is_network_visible: boolean;
  truck_types: string[] | null;
};
type ProfileRow = {
  id?: string;
  user_id: string;
  price_6w: number | null;
  price_10w: number | null;
  price_12w: number | null;
  price_semi: number | null;
  price_trailer_2: number | null;
  price_trailer_3: number | null;
  price_trailer_4: number | null;
  wait_time_price: number | null;
  distance_surcharge: number | null;
  equipment: string[];
  internal_notes: string;
  partner_status: string;
  average_volume: string;
  materials_transported: string[];
};

type StatsRow = { user_id: string; jobs: number; trips: number; invoiced: number; last_activity: string | null };

const EQUIPMENT_OPTIONS = [
  { key: "6w", label: "6 roues" },
  { key: "10w", label: "10 roues" },
  { key: "12w", label: "12 roues" },
  { key: "semi", label: "Semi-remorque" },
  { key: "trailer_2", label: "Remorque 2 essieux" },
  { key: "trailer_3", label: "Remorque 3 essieux" },
  { key: "trailer_4", label: "Remorque 4 essieux" },
];

const PARTNER_STATUSES = ["actif", "inactif", "en évaluation", "prioritaire", "suspendu"];

const PRICE_FIELDS: { key: keyof ProfileRow; label: string }[] = [
  { key: "price_6w", label: "Prix voyage 6 roues" },
  { key: "price_10w", label: "Prix voyage 10 roues" },
  { key: "price_12w", label: "Prix voyage 12 roues" },
  { key: "price_semi", label: "Prix semi-remorque" },
  { key: "price_trailer_2", label: "Prix remorque 2 essieux" },
  { key: "price_trailer_3", label: "Prix remorque 3 essieux" },
  { key: "price_trailer_4", label: "Prix remorque 4 essieux" },
  { key: "wait_time_price", label: "Temps attente ($/h)" },
  { key: "distance_surcharge", label: "Surcharge distance ($/km)" },
];

const emptyProfile = (user_id: string): ProfileRow => ({
  user_id,
  price_6w: null, price_10w: null, price_12w: null, price_semi: null,
  price_trailer_2: null, price_trailer_3: null, price_trailer_4: null,
  wait_time_price: null, distance_surcharge: null,
  equipment: [], internal_notes: "", partner_status: "actif",
  average_volume: "", materials_transported: [],
});

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" }) : "—";

const fmtPhone = (phone: string | null | undefined) => {
  if (!phone) return "Non renseigné";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `1-${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
};

const phoneHref = (phone: string) => `tel:+${phone.replace(/\D/g, "")}`;

const fmtMoney = (n: number) =>
  n.toLocaleString("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

const PAGE_SIZE = 20;
type EntrepreneurSort = "newest" | "oldest" | "az" | "za";
type AccountFilter = "all" | "active" | "pending";
type VisibilityFilter = "all" | "visible" | "hidden";

export default function EntrepreneursAdmin() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<RoleRow[]>([]);
  const [entrepreneurs, setEntrepreneurs] = useState<EntrepreneurRow[]>([]);
  const [stats, setStats] = useState<Record<string, StatsRow>>({});
  const [openUserId, setOpenUserId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const search = searchParams.get("entrepreneurs_q") ?? "";
  const sort = (searchParams.get("entrepreneurs_sort") as EntrepreneurSort) || "az";
  const accountFilter = (searchParams.get("entrepreneurs_account") as AccountFilter) || "all";
  const visibilityFilter = (searchParams.get("entrepreneurs_visibility") as VisibilityFilter) || "all";
  const page = Math.max(1, Number(searchParams.get("entrepreneurs_page")) || 1);

  const updateCriteria = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === "all" || (key === "entrepreneurs_sort" && value === "az")) next.delete(key);
    else next.set(key, value);
    next.delete("entrepreneurs_page");
    setSearchParams(next, { replace: true });
  };

  const setPage = (nextPage: number) => {
    const next = new URLSearchParams(searchParams);
    if (nextPage <= 1) next.delete("entrepreneurs_page");
    else next.set("entrepreneurs_page", String(nextPage));
    setSearchParams(next, { replace: true });
  };

  const load = async () => {
    setLoading(true);
    const { data: rolesData } = await supabase.rpc("list_users_with_roles");
    const ents = (rolesData || []).filter((r: any) => (r.roles || []).includes("entrepreneur"));
    setUsers(ents as RoleRow[]);

    const userIds = ents.map((e: any) => e.user_id);
    const { data: entRows } = await supabase
      .from("entrepreneurs")
      .select("id,user_id,name,company,phone,email,city,is_network_visible,truck_types")
      .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    setEntrepreneurs((entRows as any) || []);

    // Stats: count submissions assigned + trips invoiced per entrepreneur.id (mapped to user_id)
    const entIds = ((entRows as any) || []).map((e: any) => e.id);
    const userByEntId = new Map<string, string>();
    ((entRows as any) || []).forEach((e: any) => { if (e.user_id) userByEntId.set(e.id, e.user_id); });

    const acc: Record<string, StatsRow> = {};
    ents.forEach((e: any) => { acc[e.user_id] = { user_id: e.user_id, jobs: 0, trips: 0, invoiced: 0, last_activity: null }; });

    if (entIds.length) {
      const { data: subs } = await supabase
        .from("submissions")
        .select("id,assigned_entrepreneur,created_at")
        .in("assigned_entrepreneur", entIds);
      ((subs as any) || []).forEach((s: any) => {
        const uid = userByEntId.get(s.assigned_entrepreneur);
        if (!uid || !acc[uid]) return;
        acc[uid].jobs += 1;
        if (!acc[uid].last_activity || s.created_at > acc[uid].last_activity!) acc[uid].last_activity = s.created_at;
      });

      const { data: trips } = await supabase
        .from("lead_trips" as any)
        .select("entrepreneur_id,trips_count,total_price,delivery_date,created_at")
        .in("entrepreneur_id", entIds);
      ((trips as any) || []).forEach((t: any) => {
        const uid = userByEntId.get(t.entrepreneur_id);
        if (!uid || !acc[uid]) return;
        acc[uid].trips += Number(t.trips_count) || 0;
        acc[uid].invoiced += Number(t.total_price) || 0;
        const d = t.delivery_date || t.created_at;
        if (d && (!acc[uid].last_activity || d > acc[uid].last_activity!)) acc[uid].last_activity = d;
      });
    }
    setStats(acc);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const allRows = useMemo(() => {
    const entByUser = new Map<string, EntrepreneurRow>();
    entrepreneurs.forEach((e) => { if (e.user_id) entByUser.set(e.user_id, e); });
    const q = search.trim().toLowerCase();
    return users
      .map((u) => {
        const e = entByUser.get(u.user_id);
        const st = stats[u.user_id] || { jobs: 0, trips: 0, invoiced: 0, last_activity: null };
        return {
          user_id: u.user_id,
          email: u.email,
          created_at: u.created_at,
          approved: u.approved,
          company: e?.company || "",
          contact: e?.name || "",
          phone: e?.phone || "",
          city: e?.city || "",
          visible: e?.is_network_visible ?? null,
          sectors: e?.truck_types || [],
          jobs: st.jobs,
          trips: st.trips,
        };
      })
      .filter((r) => !q || `${r.company} ${r.contact} ${r.email} ${r.phone}`.toLowerCase().includes(q))
      .filter((r) => accountFilter === "all" || (accountFilter === "active" ? r.approved : !r.approved))
      .filter((r) => visibilityFilter === "all" || (visibilityFilter === "visible" ? r.visible === true : r.visible === false))
      .sort((a, b) => {
        if (sort === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (sort === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        const left = a.company || a.email;
        const right = b.company || b.email;
        return sort === "za" ? right.localeCompare(left, "fr") : left.localeCompare(right, "fr");
      });
  }, [users, entrepreneurs, stats, search, accountFilter, visibilityFilter, sort]);

  const totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const rows = allRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    if (!loading && page > totalPages) setPage(totalPages);
  }, [loading, page, totalPages]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Entrepreneurs <span className="text-muted-foreground">({allRows.length})</span>
        </h1>
      </div>

      <div className="mb-5 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => updateCriteria("entrepreneurs_q", e.target.value)}
            placeholder="Rechercher entreprise, contact, courriel ou téléphone…"
            aria-label="Rechercher des entrepreneurs"
            className="min-h-11 w-full rounded-lg border border-input bg-background py-2 pl-10 pr-3 text-base sm:text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <label className="sr-only" htmlFor="entrepreneurs-sort">Trier les entrepreneurs</label>
          <select
            id="entrepreneurs-sort"
            value={sort}
            onChange={(e) => updateCriteria("entrepreneurs_sort", e.target.value)}
            className="min-h-11 min-w-0 rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="newest">Inscription : plus récente</option>
            <option value="oldest">Inscription : plus ancienne</option>
            <option value="az">Entreprise : A à Z</option>
            <option value="za">Entreprise : Z à A</option>
          </select>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen}>
            <SlidersHorizontal className="h-4 w-4" /> Filtres
            {(accountFilter !== "all" || visibilityFilter !== "all") && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{Number(accountFilter !== "all") + Number(visibilityFilter !== "all")}</span>}
          </Button>
        </div>
        {filtersOpen && (
          <div className="grid gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-2">
            <label className="text-sm font-medium">Statut du compte
              <select value={accountFilter} onChange={(e) => updateCriteria("entrepreneurs_account", e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 font-normal">
                <option value="all">Tous les statuts</option><option value="active">Actif</option><option value="pending">En attente</option>
              </select>
            </label>
            <label className="text-sm font-medium">Visibilité réseau
              <select value={visibilityFilter} onChange={(e) => updateCriteria("entrepreneurs_visibility", e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 font-normal">
                <option value="all">Toutes</option><option value="visible">Visible</option><option value="hidden">Masqué</option>
              </select>
            </label>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : allRows.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-4 py-16 text-center text-muted-foreground">Aucun entrepreneur ne correspond à ces critères.</div>
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {rows.map((r) => (
              <article key={r.user_id} className="min-w-0 rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="min-w-0 break-words font-display text-lg font-bold leading-snug">{r.company || "Non renseigné"}</h2>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${r.approved ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{r.approved ? "Actif" : "En attente"}</span>
                </div>
                {(r.city || r.sectors.length > 0) && <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">{r.city && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{r.city}</span>}{r.sectors.map((sector) => <span key={sector} className="rounded-full bg-secondary px-2 py-0.5">{sector}</span>)}</div>}
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2"><dt className="text-muted-foreground">Contact</dt><dd className="min-w-0 break-words font-medium">{r.contact || "Non renseigné"}</dd></div>
                  <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2"><dt className="text-muted-foreground">Téléphone</dt><dd className="min-w-0">{r.phone ? <a href={phoneHref(r.phone)} className="break-words text-primary underline-offset-4 hover:underline">{fmtPhone(r.phone)}</a> : "Non renseigné"}</dd></div>
                  <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2"><dt className="text-muted-foreground">Courriel</dt><dd className="min-w-0">{r.email ? <a href={`mailto:${r.email}`} className="block break-all text-primary underline-offset-4 hover:underline">{r.email}</a> : "Non renseigné"}</dd></div>
                  <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2"><dt className="text-muted-foreground">Inscription</dt><dd>{fmtDate(r.created_at)}</dd></div>
                  <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2"><dt className="text-muted-foreground">Activité</dt><dd>{r.jobs} travail{r.jobs === 1 ? "" : "x"} · {r.trips} voyage{r.trips === 1 ? "" : "s"}</dd></div>
                  <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2"><dt className="text-muted-foreground">Réseau</dt><dd>{r.visible === true ? "Visible" : r.visible === false ? "Masqué" : "Non renseigné"}</dd></div>
                </dl>
                <Button type="button" className="mt-4 min-h-11 w-full" onClick={() => setOpenUserId(r.user_id)}>Voir la fiche</Button>
                <a href={`/entrepreneur/crm?support_user=${r.user_id}`} className="mt-2 block min-h-11 rounded-md border border-border py-2.5 text-center text-sm font-semibold text-primary">Ouvrir le CRM de cette entreprise</a>
              </article>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
            <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[1040px] table-auto text-sm">
              <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">Entreprise</th>
                  <th className="text-left px-4 py-3">Contact</th>
                  <th className="text-left px-4 py-3">Courriel</th>
                  <th className="text-left px-4 py-3">Téléphone</th>
                  <th className="text-left px-4 py-3">Inscription</th>
                  <th className="text-left px-4 py-3">Statut</th>
                  <th className="text-right px-4 py-3">Jobs</th>
                  <th className="text-right px-4 py-3">Voyages</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.user_id} className="cursor-pointer border-t border-border hover:bg-muted/40" onClick={() => setOpenUserId(r.user_id)}>
                    <td className="max-w-56 whitespace-normal px-4 py-3 font-semibold">{r.company || <span className="text-muted-foreground">Non renseigné</span>}</td>
                    <td className="max-w-48 whitespace-normal px-4 py-3">{r.contact || <span className="text-muted-foreground">Non renseigné</span>}</td>
                    <td className="px-4 py-3"><a className="whitespace-nowrap text-primary hover:underline" href={`mailto:${r.email}`} onClick={(e) => e.stopPropagation()}>{r.email || "Non renseigné"}</a></td>
                    <td className="whitespace-nowrap px-4 py-3">{r.phone ? <a href={phoneHref(r.phone)} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>{fmtPhone(r.phone)}</a> : <span className="text-muted-foreground">Non renseigné</span>}</td>
                    <td className="px-4 py-3">{fmtDate(r.created_at)}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary">
                        {r.approved ? "Actif" : "En attente"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{r.jobs}</td>
                    <td className="px-4 py-3 text-right font-mono">{r.trips}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-muted-foreground">{(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, allRows.length)} sur {allRows.length}</p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" aria-label="Page précédente" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="min-w-20 text-center">Page {currentPage} / {totalPages}</span>
              <Button type="button" variant="outline" size="icon" aria-label="Page suivante" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </>
      )}

      <div className="mt-8"><VisibilityAuditList /></div>

      {openUserId && (
        <EntrepreneurDetailModal
          userId={openUserId}
          email={users.find((u) => u.user_id === openUserId)?.email || ""}
          entrepreneur={entrepreneurs.find((e) => e.user_id === openUserId)}
          stats={stats[openUserId]}
          createdAt={users.find((u) => u.user_id === openUserId)?.created_at || ""}
          onClose={() => setOpenUserId(null)}
          onSaved={load}
        />
      )}
    </>
  );
}

function EntrepreneurDetailModal({
  userId, email, entrepreneur, stats, createdAt, onClose, onSaved,
}: {
  userId: string;
  email: string;
  entrepreneur?: EntrepreneurRow;
  stats?: StatsRow;
  createdAt: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [profile, setProfile] = useState<ProfileRow>(emptyProfile(userId));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [materialInput, setMaterialInput] = useState("");
  const [tab, setTab] = useState<"informations" | "tarification" | "facturation">("informations");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("entrepreneur_profiles" as any).select("*").eq("user_id", userId).maybeSingle();
      if (data) setProfile({ ...emptyProfile(userId), ...(data as any) });
      setLoading(false);
    })();
  }, [userId]);

  const toggleEquip = (k: string) => {
    setProfile((p) => ({ ...p, equipment: p.equipment.includes(k) ? p.equipment.filter((x) => x !== k) : [...p.equipment, k] }));
  };

  const setNum = (k: keyof ProfileRow, v: string) => {
    setProfile((p) => ({ ...p, [k]: v === "" ? null : Number(v) } as ProfileRow));
  };

  const save = async () => {
    setSaving(true);
    const { user_id, ...rest } = profile;
    const payload = { user_id, ...rest };
    const { error } = await supabase.from("entrepreneur_profiles" as any).upsert(payload, { onConflict: "user_id" });
    setSaving(false);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Configuration enregistrée" });
    onSaved();
  };

  const addMaterial = () => {
    const v = materialInput.trim();
    if (!v) return;
    setProfile((p) => ({ ...p, materials_transported: [...new Set([...p.materials_transported, v])] }));
    setMaterialInput("");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="bg-background w-full max-w-4xl rounded-none sm:rounded-xl border border-border shadow-xl my-0 sm:my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-background z-10">
          <div>
            <h2 className="text-xl font-display font-bold flex items-center gap-2"><Building2 className="w-5 h-5" /> {entrepreneur?.company || email}</h2>
            <p className="text-xs text-muted-foreground">Fiche entrepreneur</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted"><X className="w-5 h-5" /></button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : (
          <>
          <div className="px-5 pt-4 border-b border-border flex gap-1">
            {[
              { k: "informations", label: "Informations", icon: <UserIcon className="w-4 h-4" /> },
              { k: "tarification", label: "Tarification", icon: <Briefcase className="w-4 h-4" /> },
              { k: "facturation", label: "Facturation", icon: <Receipt className="w-4 h-4" /> },
            ].map((t) => (
              <button
                key={t.k}
                onClick={() => setTab(t.k as any)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition ${tab === t.k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {tab === "facturation" ? (
            <BillingTab entrepreneurId={entrepreneur?.id || null} entrepreneurLabel={entrepreneur?.company || email} />
          ) : (
          <div className="p-5 space-y-6">
            {tab === "informations" && (<>
            {/* Identité */}
            <section>
              <h3 className="font-display font-semibold text-sm uppercase text-muted-foreground mb-3">Identité</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <Info icon={<Building2 className="w-4 h-4" />} label="Entreprise" value={entrepreneur?.company || "—"} />
                <Info icon={<UserIcon className="w-4 h-4" />} label="Contact" value={entrepreneur?.name || "—"} />
                <Info icon={<Mail className="w-4 h-4" />} label="Courriel" value={email} />
                <Info icon={<Phone className="w-4 h-4" />} label="Téléphone" value={fmtPhone(entrepreneur?.phone)} />
                <Info icon={<Calendar className="w-4 h-4" />} label="Inscription" value={fmtDate(createdAt)} />
                <Info icon={<UserIcon className="w-4 h-4" />} label="Statut compte" value="Actif" />
              </div>
            </section>

            {/* Historique */}
            <section>
              <h3 className="font-display font-semibold text-sm uppercase text-muted-foreground mb-3">Historique automatique</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Jobs réalisées" value={String(stats?.jobs ?? 0)} icon={<Briefcase className="w-4 h-4" />} />
                <Stat label="Nombre de voyages" value={String(stats?.trips ?? 0)} icon={<Truck className="w-4 h-4" />} />
                <Stat label="Total facturé" value={fmtMoney(stats?.invoiced ?? 0)} icon={<Briefcase className="w-4 h-4" />} />
                <Stat label="Dernière activité" value={fmtDate(stats?.last_activity ?? null)} icon={<Calendar className="w-4 h-4" />} />
              </div>
            </section>
            </>)}

            {tab === "tarification" && (
            <section className="border border-primary/30 rounded-xl p-4 bg-primary/5">
              <h3 className="font-display font-bold text-base mb-4 flex items-center gap-2">⚙️ Configuration Admin</h3>

              {/* Tarification */}
              <div className="mb-5">
                <h4 className="font-display font-semibold text-sm mb-2">Tarification</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {PRICE_FIELDS.map((f) => (
                    <label key={String(f.key)} className="block text-sm">
                      <span className="text-muted-foreground text-xs">{f.label}</span>
                      <input
                        type="number"
                        step="0.01"
                        value={(profile[f.key] as number | null) ?? ""}
                        onChange={(e) => setNum(f.key, e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-input bg-background mt-1"
                        placeholder="0.00"
                      />
                    </label>
                  ))}
                </div>
              </div>

              {/* Équipements */}
              <div className="mb-5">
                <h4 className="font-display font-semibold text-sm mb-2">Équipements utilisés</h4>
                <div className="flex flex-wrap gap-2">
                  {EQUIPMENT_OPTIONS.map((opt) => {
                    const on = profile.equipment.includes(opt.key);
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => toggleEquip(opt.key)}
                        className={`px-3 py-1.5 rounded-full text-sm border transition ${on ? "bg-primary text-primary-foreground border-primary" : "bg-background border-input text-foreground"}`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Méta */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                <label className="block text-sm">
                  <span className="text-muted-foreground text-xs">Statut partenaire</span>
                  <select
                    value={profile.partner_status}
                    onChange={(e) => setProfile((p) => ({ ...p, partner_status: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background mt-1"
                  >
                    {PARTNER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-muted-foreground text-xs">Volume moyen</span>
                  <input
                    value={profile.average_volume}
                    onChange={(e) => setProfile((p) => ({ ...p, average_volume: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background mt-1"
                    placeholder="ex. 50 voyages / mois"
                  />
                </label>
              </div>

              {/* Matériaux transportés */}
              <div className="mb-5">
                <h4 className="font-display font-semibold text-sm mb-2">Type de matériaux transportés</h4>
                <div className="flex flex-wrap gap-2 mb-2">
                  {profile.materials_transported.map((m) => (
                    <span key={m} className="inline-flex items-center gap-1 px-2 py-1 bg-secondary rounded-full text-xs">
                      {m}
                      <button onClick={() => setProfile((p) => ({ ...p, materials_transported: p.materials_transported.filter((x) => x !== m) }))}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={materialInput}
                    onChange={(e) => setMaterialInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addMaterial(); } }}
                    placeholder="Ajouter un matériau (ex. terre, sable, gravier)"
                    className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm"
                  />
                  <button onClick={addMaterial} className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold">Ajouter</button>
                </div>
              </div>

              {/* Notes internes */}
              <div>
                <h4 className="font-display font-semibold text-sm mb-2">Notes internes admin</h4>
                <textarea
                  value={profile.internal_notes}
                  onChange={(e) => setProfile((p) => ({ ...p, internal_notes: e.target.value }))}
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
                  placeholder="Notes privées visibles uniquement par les admins…"
                />
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  onClick={save}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-60"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Enregistrer la configuration
                </button>
              </div>
            </section>
            )}
          </div>
          )}
          </>
        )}
      </div>
    </div>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-medium">{value}</div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">{icon}{label}</div>
      <div className="text-lg font-display font-bold">{value}</div>
    </div>
  );
}

// ============================================================
// Onglet Facturation — fiche entrepreneur
// ============================================================

type DompeRow = { id: string; dompe_number: string | null; address: string | null; name: string | null };

type InvoiceForm = {
  submission_id: string;
  trip_type: string;
  trips_count: number;
  price_per_trip: number;
  delivery_date: string;
  due_date: string;
  payment_date: string;
  payment_status: string;
  payment_method: string;
  amount_paid: number;
  taxable: boolean;
  notes: string;
  material: string;
  description: string;
};

const TRIP_TYPES = ["6 roues", "10 roues", "12 roues", "Semi-remorque", "Autre"];

const emptyInvoice = (): InvoiceForm => ({
  submission_id: "",
  trip_type: "10 roues",
  trips_count: 1,
  price_per_trip: 0,
  delivery_date: new Date().toISOString().slice(0, 10),
  due_date: "",
  payment_date: "",
  payment_status: "brouillon",
  payment_method: "",
  amount_paid: 0,
  taxable: false,
  notes: "",
  material: "",
  description: "",
});

function BillingTab({ entrepreneurId, entrepreneurLabel }: { entrepreneurId: string | null; entrepreneurLabel: string }) {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<LeadTrip[]>([]);
  const [dompes, setDompes] = useState<Record<string, DompeRow>>({});
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = async () => {
    if (!entrepreneurId) { setLoading(false); return; }
    setLoading(true);
    const { data: trips } = await supabase
      .from("lead_trips" as any)
      .select("*")
      .eq("entrepreneur_id", entrepreneurId)
      .order("created_at", { ascending: false });
    const list = ((trips as any) || []) as LeadTrip[];
    setInvoices(list);

    const subIds = [...new Set(list.map((t) => t.submission_id).filter(Boolean))];
    if (subIds.length) {
      const { data: subs } = await supabase
        .from("submissions")
        .select("id,dompe_number,address,name")
        .in("id", subIds);
      const map: Record<string, DompeRow> = {};
      ((subs as any) || []).forEach((s: any) => { map[s.id] = s; });
      setDompes(map);
    } else {
      setDompes({});
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [entrepreneurId]);

  const totals = useMemo(() => {
    let billed = 0, paid = 0, trips = 0;
    invoices.forEach((i) => {
      if (i.payment_status === "annule") return;
      billed += Number(i.total_with_tax || i.total_price || 0);
      paid += Number(i.amount_paid || 0);
      trips += Number(i.trips_count || 0);
    });
    return { billed, paid, balance: billed - paid, trips, count: invoices.length };
  }, [invoices]);

  if (!entrepreneurId) {
    return (
      <div className="p-8 text-center text-muted-foreground text-sm">
        Cet utilisateur n'a pas encore de fiche entrepreneur reliée. Créez d'abord la fiche pour gérer la facturation.
      </div>
    );
  }

  return (
    <div className="p-5 space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Stat icon={<FileText className="w-4 h-4" />} label="Factures" value={String(totals.count)} />
        <Stat icon={<Truck className="w-4 h-4" />} label="Voyages" value={String(totals.trips)} />
        <Stat icon={<Receipt className="w-4 h-4" />} label="Total facturé" value={totals.billed.toLocaleString("fr-CA", { style: "currency", currency: "CAD" })} />
        <Stat icon={<Receipt className="w-4 h-4" />} label="Total payé" value={totals.paid.toLocaleString("fr-CA", { style: "currency", currency: "CAD" })} />
        <Stat icon={<Receipt className="w-4 h-4" />} label="Solde à recevoir" value={totals.balance.toLocaleString("fr-CA", { style: "currency", currency: "CAD" })} />
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold text-base">Historique des factures</h3>
        <button
          onClick={() => { setEditingId(null); setShowForm(true); }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
        >
          <Plus className="w-4 h-4" /> Créer une facture
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">Aucune facture pour cet entrepreneur.</div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Facture</th>
                  <th className="text-left px-3 py-2">Livraison</th>
                  <th className="text-left px-3 py-2">Échéance</th>
                  <th className="text-left px-3 py-2">Dompe</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-right px-3 py-2">Voyages</th>
                  <th className="text-right px-3 py-2">Prix/V.</th>
                  <th className="text-right px-3 py-2">Total</th>
                  <th className="text-right px-3 py-2">Payé</th>
                  <th className="text-left px-3 py-2">Statut</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const d = dompes[inv.submission_id];
                  const st = findPaymentStatus(inv.payment_status);
                  const total = Number(inv.total_with_tax || inv.total_price || 0);
                  return (
                    <tr key={inv.id} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => { setEditingId(inv.id); setShowForm(true); }}>
                      <td className="px-3 py-2 font-semibold">{inv.invoice_number || "—"}</td>
                      <td className="px-3 py-2">{inv.delivery_date || "—"}</td>
                      <td className="px-3 py-2">{inv.due_date || "—"}</td>
                      <td className="px-3 py-2">{inv.submission_id ? (d?.dompe_number || "—") : <span className="text-muted-foreground italic">Aucune dompe associée</span>}</td>
                      <td className="px-3 py-2">{inv.trip_type || "—"}</td>
                      <td className="px-3 py-2 text-right font-mono">{Number(inv.trips_count || 0)}</td>
                      <td className="px-3 py-2 text-right font-mono">{Number(inv.price_per_trip || 0).toFixed(2)} $</td>
                      <td className="px-3 py-2 text-right font-mono">{total.toFixed(2)} $</td>
                      <td className="px-3 py-2 text-right font-mono">{Number(inv.amount_paid || 0).toFixed(2)} $</td>
                      <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${st.color}`}>{st.label}</span></td>
                      <td className="px-2 py-2 text-right"><button onClick={(e) => { e.stopPropagation(); setEditingId(inv.id); setShowForm(true); }} className="text-xs text-primary hover:underline">Modifier</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <InvoiceFormModal
          entrepreneurId={entrepreneurId}
          entrepreneurLabel={entrepreneurLabel}
          invoice={editingId ? invoices.find((i) => i.id === editingId) || null : null}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </div>
  );
}

function InvoiceFormModal({
  entrepreneurId, entrepreneurLabel, invoice, onClose, onSaved,
}: {
  entrepreneurId: string;
  entrepreneurLabel: string;
  invoice: LeadTrip | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<InvoiceForm>(() => {
    if (invoice) {
      return {
        submission_id: invoice.submission_id || "",
        trip_type: invoice.trip_type || "10 roues",
        trips_count: Number(invoice.trips_count) || 1,
        price_per_trip: Number(invoice.price_per_trip) || 0,
        delivery_date: invoice.delivery_date || "",
        due_date: invoice.due_date || "",
        payment_date: invoice.payment_date || "",
        payment_status: invoice.payment_status || "brouillon",
        payment_method: invoice.payment_method || "",
        amount_paid: Number(invoice.amount_paid) || 0,
        taxable: !!invoice.taxable,
        notes: invoice.notes || "",
        material: invoice.material || "",
        description: (invoice as any).description || "",
      };
    }
    return emptyInvoice();
  });
  const [dompeOptions, setDompeOptions] = useState<DompeRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    (async () => {
      // Load dompes assigned to this entrepreneur first, plus any dompes with a number
      const { data: assigned } = await supabase
        .from("submissions")
        .select("id,dompe_number,address,name")
        .eq("assigned_entrepreneur", entrepreneurId)
        .order("created_at", { ascending: false });
      const list: DompeRow[] = ((assigned as any) || []).filter((s: any) => s.dompe_number);

      // If editing and current submission isn't in the list, fetch it
      if (invoice && !list.find((d) => d.id === invoice.submission_id)) {
        const { data: cur } = await supabase
          .from("submissions")
          .select("id,dompe_number,address,name")
          .eq("id", invoice.submission_id)
          .maybeSingle();
        if (cur) list.unshift(cur as any);
      }
      setDompeOptions(list);
    })();
  }, [entrepreneurId, invoice]);

  const subtotal = (Number(form.trips_count) || 0) * (Number(form.price_per_trip) || 0);
  const taxes = computeTaxes(subtotal, form.taxable);
  const balance = taxes.total - (Number(form.amount_paid) || 0);

  const save = async () => {
    setSaving(true);
    const payload: any = {
      submission_id: form.submission_id || null,
      entrepreneur_id: entrepreneurId,
      material: form.material || "",
      trip_type: form.trip_type,
      trips_count: form.trips_count,
      price_per_trip: form.price_per_trip,
      total_price: subtotal,
      delivery_date: form.delivery_date || null,
      due_date: form.due_date || null,
      payment_date: form.payment_date || null,
      payment_status: form.payment_status,
      payment_method: form.payment_method,
      amount_paid: form.amount_paid,
      taxable: form.taxable,
      notes: form.notes,
      description: form.description,
    };
    let error;
    if (invoice) {
      ({ error } = await supabase.from("lead_trips" as any).update(payload).eq("id", invoice.id));
    } else {
      ({ error } = await supabase.from("lead_trips" as any).insert(payload));
    }
    setSaving(false);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    toast({ title: invoice ? "Facture mise à jour" : "Facture créée" });
    onSaved();
  };

  const del = async () => {
    if (!invoice) return;
    if (!confirm("Supprimer cette facture ?")) return;
    setDeleting(true);
    const { error } = await supabase.from("lead_trips" as any).delete().eq("id", invoice.id);
    setDeleting(false);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Facture supprimée" });
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-start sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="bg-background w-full max-w-2xl rounded-none sm:rounded-xl border border-border shadow-xl my-0 sm:my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-background z-10">
          <div>
            <h2 className="text-lg font-display font-bold flex items-center gap-2">
              <Receipt className="w-5 h-5" /> {invoice ? `Facture ${invoice.invoice_number}` : "Nouvelle facture"}
            </h2>
            <p className="text-xs text-muted-foreground">{entrepreneurLabel}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-sm sm:col-span-2">
              <span className="text-muted-foreground text-xs">Dompe desservie <span className="text-muted-foreground/60">(optionnel)</span></span>
              <select
                value={form.submission_id}
                onChange={(e) => setForm((f) => ({ ...f, submission_id: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background mt-1"
              >
                <option value="">— Aucune dompe —</option>
                {dompeOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.dompe_number} {d.name ? `— ${d.name}` : ""} {d.address ? `(${d.address})` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm sm:col-span-2">
              <span className="text-muted-foreground text-xs">Description des travaux</span>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background mt-1"
                placeholder="ex. 10 voyages 10 roues, Transport de terre, Livraison gravier, Dompe 240, Remblai chantier Beauport"
              />
            </label>

            <label className="block text-sm">
              <span className="text-muted-foreground text-xs">Type de voyage</span>
              <select
                value={form.trip_type}
                onChange={(e) => setForm((f) => ({ ...f, trip_type: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background mt-1"
              >
                {TRIP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>

            <label className="block text-sm">
              <span className="text-muted-foreground text-xs">Matériau</span>
              <input
                value={form.material}
                onChange={(e) => setForm((f) => ({ ...f, material: e.target.value, taxable: isMaterialTaxableByDefault(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background mt-1"
                placeholder="ex. terre, sable…"
              />
            </label>

            <label className="block text-sm">
              <span className="text-muted-foreground text-xs">Nombre de voyages</span>
              <input
                type="number" min={0} step={1}
                value={form.trips_count}
                onChange={(e) => setForm((f) => ({ ...f, trips_count: Number(e.target.value) || 0 }))}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background mt-1"
              />
            </label>

            <label className="block text-sm">
              <span className="text-muted-foreground text-xs">Prix par voyage ($)</span>
              <input
                type="number" min={0} step="0.01"
                value={form.price_per_trip}
                onChange={(e) => setForm((f) => ({ ...f, price_per_trip: Number(e.target.value) || 0 }))}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background mt-1"
              />
            </label>

            <label className="block text-sm">
              <span className="text-muted-foreground text-xs">Date de livraison</span>
              <input type="date" value={form.delivery_date} onChange={(e) => setForm((f) => ({ ...f, delivery_date: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-input bg-background mt-1" />
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground text-xs">Date d'échéance</span>
              <input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-input bg-background mt-1" />
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground text-xs">Date de paiement</span>
              <input type="date" value={form.payment_date} onChange={(e) => setForm((f) => ({ ...f, payment_date: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-input bg-background mt-1" />
            </label>

            <label className="block text-sm">
              <span className="text-muted-foreground text-xs">Statut</span>
              <select value={form.payment_status} onChange={(e) => setForm((f) => ({ ...f, payment_status: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-input bg-background mt-1">
                {PAYMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>

            <label className="block text-sm">
              <span className="text-muted-foreground text-xs">Mode de paiement</span>
              <select value={form.payment_method} onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-input bg-background mt-1">
                <option value="">—</option>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>

            <label className="block text-sm">
              <span className="text-muted-foreground text-xs">Montant payé ($)</span>
              <input
                type="number" min={0} step="0.01"
                value={form.amount_paid}
                onChange={(e) => setForm((f) => ({ ...f, amount_paid: Number(e.target.value) || 0 }))}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background mt-1"
              />
            </label>

            <label className="inline-flex items-center gap-2 text-sm mt-2">
              <Switch checked={form.taxable} onCheckedChange={(v) => setForm((f) => ({ ...f, taxable: v }))} />
              <span>Taxable (TPS + TVQ)</span>
            </label>
          </div>

          <div className="rounded-lg bg-secondary/40 border border-border p-3 text-sm space-y-1">
            <div className="flex justify-between"><span>Sous-total</span><span className="font-mono">{taxes.subtotal.toFixed(2)} $</span></div>
            {form.taxable && (
              <>
                <div className="flex justify-between text-muted-foreground"><span>TPS (5%)</span><span className="font-mono">{taxes.tps.toFixed(2)} $</span></div>
                <div className="flex justify-between text-muted-foreground"><span>TVQ (9,975%)</span><span className="font-mono">{taxes.tvq.toFixed(2)} $</span></div>
              </>
            )}
            <div className="flex justify-between font-bold border-t border-border pt-1"><span>Total</span><span className="font-mono">{taxes.total.toFixed(2)} $</span></div>
            <div className="flex justify-between"><span>Solde restant</span><span className="font-mono">{balance.toFixed(2)} $</span></div>
          </div>

          <label className="block text-sm">
            <span className="text-muted-foreground text-xs">Notes</span>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background mt-1"
            />
          </label>

          <div className="flex items-center justify-between gap-2 pt-2">
            {invoice ? (
              <button onClick={del} disabled={deleting} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-destructive/40 text-destructive text-sm hover:bg-destructive/10">
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Supprimer
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button onClick={onClose} className="px-3 py-2 rounded-lg border border-border text-sm">Annuler</button>
              <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-60">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Enregistrer
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}