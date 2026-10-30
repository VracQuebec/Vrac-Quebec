import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Cookie } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FullPageState from "@/components/FullPageState";
import TransportBanner from "@/components/TransportBanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";

type Rec = { consent_id: string; analytics: boolean; banner_version: string; policy_version: string; source: string; first_decided_at: string; last_changed_at: string; withdrawn_at: string | null };
type Ev = { id: string; action: string; analytics: boolean; previous_analytics: boolean | null; banner_version: string; policy_version: string; source: string; created_at: string };
type Settings = { retention_days: number | null; max_events_per_browser_hour: number; max_events_per_minute: number; notes: string | null; updated_at: string };

const fmt = (d: string) => new Date(d).toLocaleString("fr-CA", { timeZone: "America/Toronto" });
const ACTION: Record<string, string> = { choix_initial: "Premier choix", modification: "Modification", retrait: "Retrait" };
const SOURCE: Record<string, string> = { banniere: "Bandeau", preferences: "Gestion des préférences" };

/** Registre « Témoins et consentements » : lecture réservée aux super administrateurs (RLS has_role admin). */
export default function AdminConsents() {
  const navigate = useNavigate();
  const { user, isReady } = useAuthReady();
  const { isAdmin, loading } = useUserRoles(user, isReady);
  const [rows, setRows] = useState<Rec[]>([]);
  const [counts, setCounts] = useState({ total: 0, accepted: 0, withdrawn: 0 });
  const [selected, setSelected] = useState<string | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [retention, setRetention] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady || loading) return;
    if (!user || !isAdmin) navigate("/login", { replace: true });
  }, [isReady, loading, user, isAdmin, navigate]);

  const load = async () => {
    const [list, total, acc, wd, st] = await Promise.all([
      supabase.from("consent_records").select("consent_id,analytics,banner_version,policy_version,source,first_decided_at,last_changed_at,withdrawn_at").order("last_changed_at", { ascending: false }).limit(200),
      supabase.from("consent_records").select("consent_id", { count: "exact", head: true }),
      supabase.from("consent_records").select("consent_id", { count: "exact", head: true }).eq("analytics", true),
      supabase.from("consent_records").select("consent_id", { count: "exact", head: true }).not("withdrawn_at", "is", null),
      supabase.from("consent_settings").select("retention_days,max_events_per_browser_hour,max_events_per_minute,notes,updated_at").eq("id", 1).maybeSingle(),
    ]);
    setRows((list.data ?? []) as Rec[]);
    setCounts({ total: total.count ?? 0, accepted: acc.count ?? 0, withdrawn: wd.count ?? 0 });
    if (st.data) { setSettings(st.data as Settings); setRetention(st.data.retention_days?.toString() ?? ""); }
  };
  useEffect(() => { if (isAdmin) void load(); }, [isAdmin]);

  useEffect(() => {
    if (!selected) return;
    supabase.from("consent_events").select("id,action,analytics,previous_analytics,banner_version,policy_version,source,created_at")
      .eq("consent_id", selected).order("created_at", { ascending: true }).then(({ data }) => setEvents((data ?? []) as Ev[]));
  }, [selected]);

  const saveRetention = async () => {
    const v = retention.trim() === "" ? null : Number(retention);
    if (v !== null && (!Number.isInteger(v) || v < 1 || v > 36500)) { setMsg("Durée invalide (1 à 36 500 jours, ou vide)."); return; }
    const { error } = await supabase.from("consent_settings").update({ retention_days: v, updated_by: user!.id, updated_at: new Date().toISOString() }).eq("id", 1);
    setMsg(error ? "Enregistrement refusé : " + error.message : "Durée de conservation enregistrée.");
    void load();
  };
  const purge = async () => {
    if (!settings?.retention_days) return;
    if (!window.confirm(`Supprimer définitivement les choix non modifiés depuis plus de ${settings.retention_days} jours, avec leur historique ?`)) return;
    const { data, error } = await supabase.rpc("consent_purge_expired");
    setMsg(error ? "Purge refusée : " + error.message : `${data ?? 0} navigateur(s) supprimé(s) du registre.`);
    void load();
  };

  if (!isReady || loading) return <FullPageState message="Chargement…" />;
  if (!user || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-background">
      <TransportBanner />
      <main className="mx-auto max-w-6xl space-y-5 p-4">
        <header className="flex items-start gap-2">
          <Cookie className="mt-1 h-6 w-6" />
          <div>
            <h1 className="text-xl font-semibold">Témoins et consentements</h1>
            <p className="text-sm text-muted-foreground">
              Un identifiant aléatoire par navigateur, sans nom, courriel, adresse IP ni historique de navigation.
              Non relié au CRM. Catégorie facultative : mesure d'audience (Google Analytics). Publicité : non utilisée.
            </p>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-3">
          {[["Navigateurs inscrits", counts.total], ["Mesure d'audience acceptée", counts.accepted], ["Avec un retrait", counts.withdrawn]].map(([l, n]) => (
            <div key={l as string} className="rounded-lg border border-border bg-card p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="text-2xl font-bold">{n}</div></div>
          ))}
        </section>

        <section className="rounded-lg border border-border bg-card p-4 space-y-2">
          <h2 className="font-semibold">Durée de conservation</h2>
          <p className="text-sm text-muted-foreground">
            Durée choisie par votre administration, comptée depuis la dernière modification du choix. Vide = non définie :
            rien n'est supprimé. Aucune durée n'est présentée ici comme une obligation légale. La suppression n'est jamais
            automatique : elle se fait avec le bouton ci-dessous.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input className="w-40" inputMode="numeric" placeholder="Non définie" value={retention} onChange={(e) => setRetention(e.target.value)} aria-label="Durée en jours" />
            <span className="text-sm">jours</span>
            <Button onClick={saveRetention}>Enregistrer</Button>
            <Button variant="outline" disabled={!settings?.retention_days} onClick={purge}>Supprimer les choix expirés</Button>
          </div>
          {settings && <p className="text-xs text-muted-foreground">Protection contre les abus : {settings.max_events_per_browser_hour} changements par navigateur par heure, {settings.max_events_per_minute} inscriptions par minute pour tout le site. Dernière modification : {fmt(settings.updated_at)}.</p>}
          {msg && <p role="status" className="text-sm">{msg}</p>}
        </section>

        <section className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr>
              <th className="p-2">Identifiant</th><th className="p-2">Mesure d'audience</th><th className="p-2">Source</th>
              <th className="p-2">Bandeau / politique</th><th className="p-2">Premier choix</th><th className="p-2">Dernier changement</th><th className="p-2">Retrait</th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td className="p-3 text-muted-foreground" colSpan={7}>Aucun choix inscrit.</td></tr>}
              {rows.map((r) => (
                <tr key={r.consent_id} className={`cursor-pointer border-t border-border hover:bg-muted ${selected === r.consent_id ? "bg-muted" : ""}`} onClick={() => setSelected(r.consent_id)}>
                  <td className="p-2 font-mono text-xs">{r.consent_id.slice(0, 8)}…</td>
                  <td className="p-2">{r.analytics ? "Acceptée" : "Refusée"}</td>
                  <td className="p-2">{SOURCE[r.source] ?? r.source}</td>
                  <td className="p-2 text-xs">{r.banner_version} / {r.policy_version}</td>
                  <td className="p-2">{fmt(r.first_decided_at)}</td>
                  <td className="p-2">{fmt(r.last_changed_at)}</td>
                  <td className="p-2">{r.withdrawn_at ? fmt(r.withdrawn_at) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="p-2 text-xs text-muted-foreground">200 derniers navigateurs affichés. Cliquez une ligne pour voir son historique.</p>
        </section>

        {selected && (
          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="font-semibold">Historique de <span className="font-mono text-sm">{selected}</span></h2>
            <ol className="mt-2 space-y-1 text-sm">
              {events.map((e) => (
                <li key={e.id}>
                  {fmt(e.created_at)} — <strong>{ACTION[e.action] ?? e.action}</strong> : mesure d'audience {e.analytics ? "acceptée" : "refusée"}
                  {e.previous_analytics !== null && ` (avant : ${e.previous_analytics ? "acceptée" : "refusée"})`} · {SOURCE[e.source] ?? e.source} · {e.banner_version} / {e.policy_version}
                </li>
              ))}
            </ol>
          </section>
        )}
      </main>
    </div>
  );
}
