import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Row = { id: number; user_id: string; occurred_at: string; action: string; section: string | null; resource_type: string | null; resource_id: string | null; result: string; source: string; detail: Record<string, unknown> };
type Reader = { user_id: string; label: string; active: boolean; is_test: boolean };

const fmt = new Intl.DateTimeFormat("fr-CA", { timeZone: "America/Toronto", dateStyle: "short", timeStyle: "medium" });
const ACTIONS = ["lecture_donnees", "consultation_fiche", "comptage", "fonction_lecture", "fonction_refusee", "ecriture_refusee", "connexion", "deconnexion", "ouverture_section", "recherche", "filtre", "recherche_filtre", "document_ouverture", "document_telechargement", "export_ou_telechargement", "fonction_serveur", "action_interdite"];

/** Journal d'activité des comptes lecture seule — super administrateurs seulement (RLS has_role admin). */
export default function AdminActivityLog() {
  const { isSuperAdmin, loading } = useUserRoles();
  const [rows, setRows] = useState<Row[]>([]);
  const [readers, setReaders] = useState<Reader[]>([]);
  const [f, setF] = useState({ user: "", from: "", to: "", section: "", action: "" });
  const [retention, setRetention] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    let q = supabase.from("adm_activity_log").select("*").order("occurred_at", { ascending: false }).limit(500);
    if (f.user) q = q.eq("user_id", f.user);
    if (f.action) q = q.eq("action", f.action);
    if (f.section) q = q.ilike("section", `%${f.section}%`);
    if (f.from) q = q.gte("occurred_at", new Date(`${f.from}T00:00:00-05:00`).toISOString());
    if (f.to) q = q.lte("occurred_at", new Date(`${f.to}T23:59:59-05:00`).toISOString());
    const { data, error } = await q;
    setBusy(false);
    if (error) { toast.error("Lecture du journal impossible."); return; }
    setRows((data ?? []) as Row[]);
  }, [f]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    supabase.from("adm_readonly_users").select("user_id,label,active,is_test").then(({ data }) => setReaders((data ?? []) as Reader[]));
    supabase.from("adm_activity_settings").select("retention_days").maybeSingle().then(({ data }) => setRetention(data?.retention_days ?? null));
  }, [isSuperAdmin]);
  useEffect(() => { if (isSuperAdmin) load(); }, [isSuperAdmin, load]);

  if (loading) return <p className="p-6">Chargement…</p>;
  if (!isSuperAdmin) return <Navigate to="/admin" replace />;

  const saveRetention = async (v: string) => {
    const days = v === "" ? null : Number(v);
    const { error } = await supabase.rpc("adm_activity_set_retention", { _days: days as number });
    if (error) toast.error(error.message); else { setRetention(days); toast.success("Durée de conservation enregistrée."); }
  };

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-semibold">Journal d'activité — accès lecture seule</h1>
      <p className="text-sm text-muted-foreground">
        Heures affichées à l'heure de Québec. Source « serveur » : chaque lecture de données, fonction, document privé, connexion réussie et écriture refusée
        passant par le relais sécurisé, attribuée au compte de la session vérifiée — la base ne donne aucune donnée à ce compte hors de ce relais.
        Source « navigateur » : écrans, recherches, filtres, exports et refus d'interface déclarés par l'application, en complément — un navigateur modifié
        peut en omettre ou en ajouter pour son propre compte. Un appel direct qui contourne le relais n'obtient aucune donnée et ne peut rien modifier, mais n'est pas inscrit ici.
        Ce journal montre ce qui a été chargé, pas ce que la personne a réellement lu.
      </p>
      <section className="rounded-md border border-border p-3 text-sm space-y-2">
        <div className="font-medium">Conservation</div>
        <p className="text-muted-foreground">{retention == null ? "Durée non décidée : aucune purge automatique tant qu'une durée n'est pas choisie (décision à prendre)." : `Les entrées de plus de ${retention} jours peuvent être purgées.`}</p>
        <div className="flex flex-wrap gap-2 items-center">
          <select aria-label="Durée de conservation" className="h-9 rounded-md border border-input bg-background px-2" value={retention ?? ""} onChange={e => saveRetention(e.target.value)}>
            <option value="">Non décidée</option>
            {[90, 180, 365, 730, 1095].map(d => <option key={d} value={d}>{d} jours</option>)}
          </select>
        </div>
      </section>
      <section className="grid gap-2 sm:grid-cols-5">
        <select aria-label="Utilisateur" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={f.user} onChange={e => setF({ ...f, user: e.target.value })}>
          <option value="">Tous les comptes</option>
          {readers.map(r => <option key={r.user_id} value={r.user_id}>{r.user_id.slice(0, 8)}…{r.is_test ? " (fictif)" : ""}{r.active ? "" : " (inactif)"}</option>)}
        </select>
        <Input type="date" aria-label="Du" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} />
        <Input type="date" aria-label="Au" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} />
        <Input aria-label="Section" placeholder="Section (ex. /admin/finances)" value={f.section} onChange={e => setF({ ...f, section: e.target.value })} />
        <select aria-label="Action" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={f.action} onChange={e => setF({ ...f, action: e.target.value })}>
          <option value="">Toutes les actions</option>
          {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </section>
      <div className="flex justify-between items-center text-sm"><span>{rows.length} entrée(s){rows.length === 500 ? " (500 plus récentes)" : ""}</span><Button size="sm" variant="outline" onClick={load} disabled={busy}>Actualiser</Button></div>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted"><tr>{["Date et heure", "Compte", "Action", "Section", "Ressource", "Résultat", "Source", "Détail"].map(h => <th key={h} className="text-left p-2 whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t border-border align-top">
                <td className="p-2 whitespace-nowrap">{fmt.format(new Date(r.occurred_at))}</td>
                <td className="p-2 font-mono text-xs">{r.user_id.slice(0, 8)}…</td>
                <td className="p-2">{r.action}</td>
                <td className="p-2 break-all">{r.section}</td>
                <td className="p-2 break-all">{[r.resource_type, r.resource_id].filter(Boolean).join(" · ")}</td>
                <td className={`p-2 ${r.result === "reussi" ? "" : "text-destructive font-medium"}`}>{r.result === "reussi" ? "Réussi" : r.result === "refuse" ? "Refusé" : "Erreur"}</td>
                <td className="p-2">{r.source}</td>
                <td className="p-2 text-xs text-muted-foreground break-all">{Object.keys(r.detail || {}).length ? JSON.stringify(r.detail) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
