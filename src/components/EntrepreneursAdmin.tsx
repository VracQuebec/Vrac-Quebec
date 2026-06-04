import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, X, Save, User as UserIcon, Building2, Mail, Phone, Calendar, Briefcase, Truck } from "lucide-react";
import { Switch } from "@/components/ui/switch";

type RoleRow = { user_id: string; email: string; roles: string[]; approved: boolean; created_at: string };
type EntrepreneurRow = { id: string; user_id: string | null; name: string | null; company: string | null; phone: string | null; email: string | null };
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

const fmtMoney = (n: number) =>
  n.toLocaleString("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

export default function EntrepreneursAdmin() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<RoleRow[]>([]);
  const [entrepreneurs, setEntrepreneurs] = useState<EntrepreneurRow[]>([]);
  const [stats, setStats] = useState<Record<string, StatsRow>>({});
  const [openUserId, setOpenUserId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const { data: rolesData } = await supabase.rpc("list_users_with_roles");
    const ents = (rolesData || []).filter((r: any) => (r.roles || []).includes("entrepreneur"));
    setUsers(ents as RoleRow[]);

    const userIds = ents.map((e: any) => e.user_id);
    const { data: entRows } = await supabase
      .from("entrepreneurs")
      .select("id,user_id,name,company,phone,email")
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

  const rows = useMemo(() => {
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
          jobs: st.jobs,
          trips: st.trips,
        };
      })
      .filter((r) => !q || `${r.company} ${r.contact} ${r.email} ${r.phone}`.toLowerCase().includes(q))
      .sort((a, b) => (a.company || a.email).localeCompare(b.company || b.email));
  }, [users, entrepreneurs, stats, search]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Entrepreneurs ({rows.length})
        </h1>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher entreprise, contact, courriel…"
          className="px-3 py-2 rounded-lg border border-input bg-background text-sm w-full sm:w-80"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">Aucun entrepreneur inscrit pour le moment.</div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
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
                  <tr key={r.user_id} className="border-t border-border hover:bg-muted/40 cursor-pointer" onClick={() => setOpenUserId(r.user_id)}>
                    <td className="px-4 py-3 font-semibold">{r.company || <span className="text-muted-foreground italic">—</span>}</td>
                    <td className="px-4 py-3">{r.contact || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-3"><a className="text-primary hover:underline" href={`mailto:${r.email}`} onClick={(e) => e.stopPropagation()}>{r.email}</a></td>
                    <td className="px-4 py-3">{r.phone || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-3">{fmtDate(r.created_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.approved ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                        {r.approved ? "Approuvé" : "En attente"}
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
      )}

      {openUserId && (
        <EntrepreneurDetailModal
          userId={openUserId}
          email={users.find((u) => u.user_id === openUserId)?.email || ""}
          entrepreneur={entrepreneurs.find((e) => e.user_id === openUserId)}
          stats={stats[openUserId]}
          createdAt={users.find((u) => u.user_id === openUserId)?.created_at || ""}
          approved={users.find((u) => u.user_id === openUserId)?.approved || false}
          onClose={() => setOpenUserId(null)}
          onSaved={load}
        />
      )}
    </>
  );
}

function EntrepreneurDetailModal({
  userId, email, entrepreneur, stats, createdAt, approved, onClose, onSaved,
}: {
  userId: string;
  email: string;
  entrepreneur?: EntrepreneurRow;
  stats?: StatsRow;
  createdAt: string;
  approved: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [profile, setProfile] = useState<ProfileRow>(emptyProfile(userId));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [materialInput, setMaterialInput] = useState("");

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
          <div className="p-5 space-y-6">
            {/* Identité */}
            <section>
              <h3 className="font-display font-semibold text-sm uppercase text-muted-foreground mb-3">Identité</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <Info icon={<Building2 className="w-4 h-4" />} label="Entreprise" value={entrepreneur?.company || "—"} />
                <Info icon={<UserIcon className="w-4 h-4" />} label="Contact" value={entrepreneur?.name || "—"} />
                <Info icon={<Mail className="w-4 h-4" />} label="Courriel" value={email} />
                <Info icon={<Phone className="w-4 h-4" />} label="Téléphone" value={entrepreneur?.phone || "—"} />
                <Info icon={<Calendar className="w-4 h-4" />} label="Inscription" value={fmtDate(createdAt)} />
                <Info icon={<UserIcon className="w-4 h-4" />} label="Statut compte" value={approved ? "Approuvé" : "En attente"} />
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

            {/* Configuration Admin */}
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
          </div>
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