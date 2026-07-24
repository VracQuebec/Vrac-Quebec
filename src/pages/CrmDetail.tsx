import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import FullPageState from "@/components/FullPageState";
import { toast } from "@/hooks/use-toast";
import {
  ArrowLeft, Star, StarOff, Archive, ArchiveRestore, Merge, Trash2, Loader2,
  Phone, Mail, MessageSquare, ClipboardList, FileText, Upload, MapPin,
  History, Users, Tag, User as UserIcon, Save, Plus, Download,
} from "lucide-react";

type OwnerType = "client" | "carrier" | "dump" | "entrepreneur";
const TABLE_BY_TYPE: Record<OwnerType, string> = {
  client: "clients",
  carrier: "carriers",
  dump: "dumps",
  entrepreneur: "entrepreneur_profiles",
};
const LABEL_BY_TYPE: Record<OwnerType, string> = {
  client: "Client", carrier: "Transporteur", dump: "Dompe", entrepreneur: "Entrepreneur",
};

type Tab = "overview" | "timeline" | "notes" | "documents" | "tasks" | "stats" | "map" | "audit";
const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "overview", label: "Vue générale", icon: UserIcon },
  { key: "timeline", label: "Timeline", icon: History },
  { key: "notes", label: "Notes", icon: MessageSquare },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "tasks", label: "Tâches & rappels", icon: ClipboardList },
  { key: "stats", label: "Statistiques", icon: Users },
  { key: "map", label: "Carte", icon: MapPin },
  { key: "audit", label: "Historique", icon: History },
];

export default function CrmDetail() {
  const { ownerType, id } = useParams<{ ownerType: OwnerType; id: string }>();
  const navigate = useNavigate();
  const { user, isReady } = useAuthReady();
  const { isAdmin, loading: roleLoading } = useUserRoles(user, isReady);
  const [entity, setEntity] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");

  const validType = ownerType && (ownerType in TABLE_BY_TYPE);

  useEffect(() => {
    if (!isReady || roleLoading) return;
    if (!user || !isAdmin) navigate("/login", { replace: true });
  }, [isReady, roleLoading, user, isAdmin, navigate]);

  const load = async () => {
    if (!validType || !id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from(TABLE_BY_TYPE[ownerType as OwnerType] as never)
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    setEntity(data);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id, ownerType]);

  if (!isReady || !user || roleLoading) return <FullPageState title="Chargement" message="Vérification des permissions…" />;
  if (!validType) return <FullPageState title="Type invalide" message="Fiche introuvable." />;
  if (loading) return <FullPageState title="Chargement de la fiche" message="…" />;
  if (!entity) return <FullPageState title="Introuvable" message="Cette fiche n'existe pas ou a été supprimée." />;

  const type = ownerType as OwnerType;
  const displayName = entity.name || entity.contact_name || entity.email || "Fiche";

  const toggleFavorite = async () => {
    const next = !entity.is_favorite;
    const { error } = await supabase.from(TABLE_BY_TYPE[type] as never).update({ is_favorite: next }).eq("id", id!);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    setEntity({ ...entity, is_favorite: next });
  };
  const toggleArchive = async () => {
    const next = entity.archived_at ? null : new Date().toISOString();
    const { error } = await supabase.from(TABLE_BY_TYPE[type] as never)
      .update({ archived_at: next, is_active: !next }).eq("id", id!);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    setEntity({ ...entity, archived_at: next, is_active: !next });
    toast({ title: next ? "Fiche archivée" : "Fiche restaurée" });
  };
  const remove = async () => {
    if (!confirm(`Supprimer définitivement cette fiche ${LABEL_BY_TYPE[type].toLowerCase()} ?`)) return;
    const { error } = await supabase.from(TABLE_BY_TYPE[type] as never).delete().eq("id", id!);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    navigate("/admin/crm");
  };
  const doMerge = async () => {
    const target = prompt("ID de la fiche cible (celle à conserver) :");
    if (!target) return;
    const { error } = await supabase.rpc("crm_merge_entities" as never, {
      _owner_type: type, _source_id: id!, _target_id: target,
    } as never);
    if (error) return toast({ title: "Fusion échouée", description: error.message, variant: "destructive" });
    toast({ title: "Fusion effectuée" });
    navigate(`/admin/crm/${type}/${target}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border bg-card">
        <div className="container mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link to="/admin/crm" className="flex items-center gap-2 text-sm font-display font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Retour au CRM
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-display font-semibold">{LABEL_BY_TYPE[type]}</span>
            <h1 className="font-display font-bold truncate">{displayName}</h1>
            {entity.archived_at && <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Archivée</span>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleFavorite} className="p-2 rounded-lg hover:bg-secondary" aria-label="Favori">
              {entity.is_favorite ? <Star className="w-4 h-4 fill-primary text-primary" /> : <StarOff className="w-4 h-4" />}
            </button>
            <button onClick={toggleArchive} className="p-2 rounded-lg hover:bg-secondary" aria-label="Archiver">
              {entity.archived_at ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
            </button>
            {type !== "entrepreneur" && (
              <button onClick={doMerge} className="p-2 rounded-lg hover:bg-secondary" aria-label="Fusionner">
                <Merge className="w-4 h-4" />
              </button>
            )}
            <button onClick={remove} className="p-2 rounded-lg hover:bg-destructive/10 text-destructive" aria-label="Supprimer">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 sm:px-6 py-6">
        <div className="flex flex-wrap gap-2 mb-6">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-3 py-2 rounded-lg text-sm font-display font-semibold inline-flex items-center gap-2 transition-colors ${
                tab === key ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/80"
              }`}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {tab === "overview" && <OverviewTab type={type} entity={entity} onSaved={load} />}
        {tab === "timeline" && <TimelineTab type={type} id={id!} />}
        {tab === "notes" && <ActivityTab type={type} id={id!} kinds={["note"]} title="Notes internes" />}
        {tab === "documents" && <DocumentsTab type={type} id={id!} />}
        {tab === "tasks" && <ActivityTab type={type} id={id!} kinds={["task", "reminder"]} title="Tâches & rappels" allowDueDate />}
        {tab === "stats" && <StatsTab type={type} entity={entity} />}
        {tab === "map" && <MapTab entity={entity} />}
        {tab === "audit" && <AuditTab type={type} id={id!} />}
      </main>
    </div>
  );
}

/* -------- Tabs -------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide font-display font-bold text-muted-foreground">{label}</div>
      <div className="text-sm font-body">{children ?? "—"}</div>
    </div>
  );
}

function OverviewTab({ type, entity, onSaved }: { type: OwnerType; entity: any; onSaved: () => void }) {
  const [tagInput, setTagInput] = useState("");
  const [status, setStatus] = useState<string>(entity.status_label || "active");
  const [saving, setSaving] = useState(false);

  const save = async (patch: Record<string, any>) => {
    setSaving(true);
    const { error } = await supabase.from(TABLE_BY_TYPE[type] as never).update(patch).eq("id", entity.id);
    setSaving(false);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    toast({ title: "Enregistré" });
    onSaved();
  };

  const addTag = async () => {
    const t = tagInput.trim();
    if (!t) return;
    const next = Array.from(new Set([...(entity.tags || []), t]));
    await save({ tags: next });
    setTagInput("");
  };
  const removeTag = async (t: string) => {
    const next = (entity.tags || []).filter((x: string) => x !== t);
    await save({ tags: next });
  };

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <section className="md:col-span-2 bg-card border border-border rounded-lg p-5">
        <h2 className="font-display font-bold mb-4">Informations générales</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom">{entity.name}</Field>
          <Field label="Entreprise / Contact">{entity.company ?? entity.contact_name ?? "—"}</Field>
          <Field label="Courriel">{entity.email}</Field>
          <Field label="Téléphone">{entity.phone}</Field>
          <Field label="Adresse">{entity.address}</Field>
          <Field label="Ville">{entity.city}</Field>
          <Field label="Code postal">{entity.postal_code}</Field>
          <Field label="Créée le">{new Date(entity.created_at).toLocaleString("fr-CA")}</Field>
          <Field label="Dernière activité">{entity.last_activity_at ? new Date(entity.last_activity_at).toLocaleString("fr-CA") : "—"}</Field>
          <Field label="ID">{entity.id}</Field>
        </div>
      </section>

      <aside className="space-y-4">
        <section className="bg-card border border-border rounded-lg p-5">
          <h3 className="font-display font-bold mb-3 text-sm uppercase">Responsable & statut</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-display font-bold text-muted-foreground">Statut</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}
                onBlur={() => status !== entity.status_label && save({ status_label: status })}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm">
                <option value="active">Actif</option>
                <option value="prospect">Prospect</option>
                <option value="vip">VIP</option>
                <option value="pause">En pause</option>
                <option value="lost">Perdu</option>
              </select>
            </div>
            <Field label="Responsable">{entity.assignee_id ?? "Non assigné"}</Field>
          </div>
        </section>

        <section className="bg-card border border-border rounded-lg p-5">
          <h3 className="font-display font-bold mb-3 text-sm uppercase inline-flex items-center gap-2"><Tag className="w-4 h-4" /> Tags</h3>
          <div className="flex flex-wrap gap-2 mb-3">
            {(entity.tags || []).length === 0 && <span className="text-xs text-muted-foreground">Aucun tag</span>}
            {(entity.tags || []).map((t: string) => (
              <button key={t} onClick={() => removeTag(t)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-primary/10 text-primary hover:bg-destructive/10 hover:text-destructive">
                {t} ✕
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTag()}
              placeholder="Ajouter un tag" className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm" />
            <button onClick={addTag} disabled={saving} className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-display font-semibold">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </section>
      </aside>
    </div>
  );
}

function ActivityTab({ type, id, kinds, title, allowDueDate }: {
  type: OwnerType; id: string; kinds: string[]; title: string; allowDueDate?: boolean;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState(kinds[0]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [due, setDue] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("crm_activities")
      .select("*").eq("owner_type", type).eq("owner_id", id)
      .in("kind", kinds).order("created_at", { ascending: false }).limit(200);
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id, type, kinds.join(",")]);

  const add = async () => {
    if (!subject.trim() && !body.trim()) return;
    const { error } = await supabase.from("crm_activities").insert({
      owner_type: type, owner_id: id, kind, subject: subject.trim() || null,
      body: body.trim() || null, due_at: due || null,
    });
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    setSubject(""); setBody(""); setDue("");
    load();
  };
  const complete = async (rowId: string) => {
    const { error } = await supabase.from("crm_activities").update({ completed_at: new Date().toISOString() }).eq("id", rowId);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    load();
  };
  const del = async (rowId: string) => {
    const { error } = await supabase.from("crm_activities").delete().eq("id", rowId);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    load();
  };

  return (
    <section className="bg-card border border-border rounded-lg p-5">
      <h2 className="font-display font-bold mb-4">{title}</h2>
      <div className="grid gap-2 md:grid-cols-6 mb-4">
        {kinds.length > 1 && (
          <select value={kind} onChange={(e) => setKind(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm md:col-span-1">
            {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        )}
        <input placeholder="Sujet" value={subject} onChange={(e) => setSubject(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border bg-background text-sm md:col-span-2" />
        <input placeholder="Détails" value={body} onChange={(e) => setBody(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border bg-background text-sm md:col-span-2" />
        {allowDueDate && (
          <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm md:col-span-1" />
        )}
        <button onClick={add} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-display font-semibold md:col-span-1">
          Ajouter
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-6">Aucune entrée.</div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className={`border border-border rounded-lg p-3 ${r.completed_at ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-display font-bold text-muted-foreground uppercase">
                    {r.kind} · {new Date(r.created_at).toLocaleString("fr-CA")}
                    {r.due_at && ` · échéance ${new Date(r.due_at).toLocaleString("fr-CA")}`}
                  </div>
                  {r.subject && <div className="font-body font-semibold text-sm">{r.subject}</div>}
                  {r.body && <div className="text-sm font-body text-muted-foreground whitespace-pre-wrap">{r.body}</div>}
                </div>
                <div className="flex items-center gap-1">
                  {allowDueDate && !r.completed_at && (
                    <button onClick={() => complete(r.id)} className="text-xs px-2 py-1 rounded bg-primary/10 text-primary">Marquer fait</button>
                  )}
                  <button onClick={() => del(r.id)} className="p-1 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TimelineTab({ type, id }: { type: OwnerType; id: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.from("crm_activities")
        .select("*").eq("owner_type", type).eq("owner_id", id)
        .order("created_at", { ascending: false }).limit(500);
      if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
      setRows(data || []);
      setLoading(false);
    })();
  }, [type, id]);

  const iconOf = (k: string) => k === "call" ? Phone : k === "email" ? Mail : k === "note" ? MessageSquare : ClipboardList;

  return (
    <section className="bg-card border border-border rounded-lg p-5">
      <h2 className="font-display font-bold mb-4">Timeline des activités</h2>
      {loading ? <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        : rows.length === 0 ? <div className="text-center text-sm text-muted-foreground py-6">Aucune activité pour l'instant.</div>
        : (
          <ol className="relative border-l border-border pl-6 space-y-4">
            {rows.map((r) => {
              const Icon = iconOf(r.kind);
              return (
                <li key={r.id} className="relative">
                  <span className="absolute -left-[31px] top-1 w-6 h-6 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
                    <Icon className="w-3.5 h-3.5 text-primary" />
                  </span>
                  <div className="text-xs text-muted-foreground font-display font-bold uppercase">
                    {r.kind} · {new Date(r.created_at).toLocaleString("fr-CA")}
                  </div>
                  {r.subject && <div className="text-sm font-body font-semibold">{r.subject}</div>}
                  {r.body && <div className="text-sm text-muted-foreground whitespace-pre-wrap">{r.body}</div>}
                </li>
              );
            })}
          </ol>
        )}
    </section>
  );
}

function DocumentsTab({ type, id }: { type: OwnerType; id: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("crm_documents")
      .select("*").eq("owner_type", type).eq("owner_id", id)
      .order("created_at", { ascending: false });
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [type, id]);

  const onUpload = async (file: File) => {
    setUploading(true);
    const path = `${type}/${id}/${Date.now()}-${file.name.replace(/[^A-Za-z0-9._-]/g, "_")}`;
    const { error: upErr } = await supabase.storage.from("crm-docs").upload(path, file, { upsert: false });
    if (upErr) { setUploading(false); return toast({ title: "Upload échoué", description: upErr.message, variant: "destructive" }); }
    const { error } = await supabase.from("crm_documents").insert({
      owner_type: type, owner_id: id, kind: "attachment", title: file.name, url: path,
      mime_type: file.type, size_bytes: file.size,
    });
    setUploading(false);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    load();
  };

  const download = async (path: string) => {
    const { data, error } = await supabase.storage.from("crm-docs").createSignedUrl(path, 300);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    window.open(data.signedUrl, "_blank");
  };

  const del = async (row: any) => {
    if (!confirm("Supprimer ce document ?")) return;
    await supabase.storage.from("crm-docs").remove([row.url]);
    await supabase.from("crm_documents").delete().eq("id", row.id);
    load();
  };

  return (
    <section className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-bold">Documents (PDF, images, contrats)</h2>
        <div>
          <input ref={fileInput} type="file" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; }} />
          <button onClick={() => fileInput.current?.click()} disabled={uploading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-display font-semibold">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Ajouter
          </button>
        </div>
      </div>
      {loading ? <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        : rows.length === 0 ? <div className="text-center text-sm text-muted-foreground py-6">Aucun document.</div>
        : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-3">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-body font-semibold truncate">{r.title || r.url.split("/").pop()}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.mime_type || "—"} · {r.size_bytes ? Math.round(r.size_bytes / 1024) + " Ko" : ""} · {new Date(r.created_at).toLocaleDateString("fr-CA")}
                  </div>
                </div>
                <button onClick={() => download(r.url)} className="p-2 rounded hover:bg-secondary" aria-label="Télécharger"><Download className="w-4 h-4" /></button>
                <button onClick={() => del(r)} className="p-2 rounded hover:bg-destructive/10 text-destructive" aria-label="Supprimer"><Trash2 className="w-4 h-4" /></button>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

function StatsTab({ type, entity }: { type: OwnerType; entity: any }) {
  const [stats, setStats] = useState<{ submissions: number; transports: number; payments: number; revenue: number } | null>(null);

  useEffect(() => {
    (async () => {
      if (type === "client") {
        const [subs, trs, pays] = await Promise.all([
          supabase.from("submissions").select("id", { count: "exact", head: true }).eq("client_id", entity.id),
          supabase.from("transport_requests").select("id", { count: "exact", head: true }).eq("client_id", entity.id),
          supabase.from("payments").select("amount").eq("client_id", entity.id),
        ]);
        const revenue = (pays.data || []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
        setStats({ submissions: subs.count || 0, transports: trs.count || 0, payments: (pays.data || []).length, revenue });
      } else if (type === "carrier") {
        const [t, d] = await Promise.all([
          supabase.from("trucks").select("id", { count: "exact", head: true }).eq("carrier_id", entity.id),
          supabase.from("drivers").select("id", { count: "exact", head: true }).eq("carrier_id", entity.id),
        ]);
        setStats({ submissions: t.count || 0, transports: d.count || 0, payments: 0, revenue: 0 });
      } else {
        setStats({ submissions: 0, transports: 0, payments: 0, revenue: 0 });
      }
    })();
  }, [type, entity.id]);

  const cards = type === "carrier"
    ? [{ label: "Camions", value: stats?.submissions ?? "—" }, { label: "Chauffeurs", value: stats?.transports ?? "—" }]
    : [
        { label: "Soumissions", value: stats?.submissions ?? "—" },
        { label: "Demandes transport", value: stats?.transports ?? "—" },
        { label: "Paiements", value: stats?.payments ?? "—" },
        { label: "Revenu total", value: `${(stats?.revenue ?? 0).toFixed(2)} $` },
      ];

  return (
    <section className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="bg-card border border-border rounded-lg p-5">
          <div className="text-xs uppercase font-display font-bold text-muted-foreground">{c.label}</div>
          <div className="text-2xl font-display font-bold mt-1">{c.value}</div>
        </div>
      ))}
    </section>
  );
}

function MapTab({ entity }: { entity: any }) {
  const lat = entity.latitude ?? entity.postal_latitude;
  const lng = entity.longitude ?? entity.postal_longitude;
  if (!lat || !lng) {
    return <div className="bg-card border border-border rounded-lg p-6 text-sm text-muted-foreground">Aucune coordonnée géographique disponible pour cette fiche.</div>;
  }
  const src = `https://www.google.com/maps?q=${lat},${lng}&z=14&output=embed`;
  return (
    <section className="bg-card border border-border rounded-lg overflow-hidden">
      <iframe title="Carte" src={src} className="w-full h-[480px]" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
    </section>
  );
}

function AuditTab({ type, id }: { type: OwnerType; id: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.from("crm_audit_log")
        .select("*").eq("owner_type", type).eq("owner_id", id)
        .order("created_at", { ascending: false }).limit(200);
      if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
      setRows(data || []);
      setLoading(false);
    })();
  }, [type, id]);

  return (
    <section className="bg-card border border-border rounded-lg p-5">
      <h2 className="font-display font-bold mb-4">Historique des changements</h2>
      {loading ? <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        : rows.length === 0 ? <div className="text-center text-sm text-muted-foreground py-6">Aucun changement enregistré.</div>
        : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="border border-border rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-display font-bold uppercase text-muted-foreground">
                    {r.action} · {new Date(r.created_at).toLocaleString("fr-CA")}
                  </div>
                  <div className="text-xs text-muted-foreground">{r.actor_email ?? r.actor_id ?? "système"}</div>
                </div>
                {r.field && <div className="text-sm mt-1">Champ: <code>{r.field}</code></div>}
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}