// Autorisations CRM internes ou offertes — super admin uniquement.
// Attribution et retrait passent par les règles serveur (RLS admin, motif
// obligatoire, historique figé dans platform_change_log). Une autorisation
// ne se modifie pas : on la retire puis on en crée une nouvelle.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

type Grant = {
  id: string; kind: string; reason: string; granted_by: string; granted_at: string;
  revoked_at: string | null; revoke_reason: string | null;
};
type Log = { id: string; action: string; created_at: string; actor_email: string | null; changes: any };

const dt = (s: string) => new Date(s).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" });
const SOURCE: Record<string, string> = {
  subscription: "Abonnement en cours", grant: "Autorisation interne ou offerte",
  transition: "Période de transition (contrôle non activé)", none: "Accès limité — aucun droit payant",
};

export default function AccessGrantsPanel({ companyId, companyName }: { companyId: string | null; companyName?: string }) {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [kind, setKind] = useState("interne");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState("");

  const load = useCallback(async () => {
    if (!companyId) return;
    const [g, l, s] = await Promise.all([
      db.from("platform_access_grants").select("*").eq("company_id", companyId).order("granted_at", { ascending: false }),
      db.from("platform_change_log").select("id,action,created_at,actor_email,changes")
        .eq("entity_table", "platform_access_grants").eq("company_id", companyId).order("created_at", { ascending: false }).limit(50),
      db.rpc("entcrm_access_status", { _company_id: companyId }),
    ]);
    setGrants(g.data ?? []); setLogs(l.data ?? []); setStatus(s.data ?? null);
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);

  const active = grants.find((g) => !g.revoked_at);

  const grant = async () => {
    if (reason.trim().length < 3) return toast.error("Motif obligatoire (3 caractères minimum).");
    if (!window.confirm(`Accorder une autorisation ${kind} à « ${companyName ?? companyId} » ?`)) return;
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await db.from("platform_access_grants").insert({ company_id: companyId, kind, reason: reason.trim(), granted_by: user?.id });
    setBusy(false);
    if (error) return toast.error(`Refusé : ${error.message}`);
    toast.success("Autorisation accordée"); setReason(""); load();
  };

  const revoke = async (id: string) => {
    if (revokeReason.trim().length < 3) return toast.error("Motif du retrait obligatoire.");
    if (!window.confirm("Retirer cette autorisation ? L'entreprise reviendra à l'accès limité si elle n'a pas d'abonnement.")) return;
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await db.from("platform_access_grants")
      .update({ revoked_at: new Date().toISOString(), revoked_by: user?.id, revoke_reason: revokeReason.trim() }).eq("id", id);
    setBusy(false);
    if (error) return toast.error(`Refusé : ${error.message}`);
    toast.success("Autorisation retirée"); setRevoking(null); setRevokeReason(""); load();
  };

  if (!companyId) return null;
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4" aria-label="Autorisations CRM">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 font-display text-base font-bold"><ShieldCheck className="h-4 w-4 text-primary" /> Autorisations CRM</h3>
          <p className="text-xs text-muted-foreground">Entreprise : <strong>{companyName}</strong> · identifiant <code className="text-[11px]">{companyId}</code></p>
        </div>
        <p className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold" data-testid="access-status">
          {status ? SOURCE[status.source] ?? status.source : "…"}
          {status?.enforced === false && status?.source !== "transition" ? " · contrôle non activé" : ""}
        </p>
      </div>

      {active ? (
        <div className="rounded-lg border border-border p-3 text-sm">
          <p><strong>Autorisation {active.kind}</strong> active depuis le {dt(active.granted_at)}</p>
          <p className="text-muted-foreground">Motif : {active.reason}</p>
          {revoking === active.id ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <input aria-label="Motif du retrait" value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="Motif du retrait (obligatoire)" className="h-9 min-w-[220px] flex-1 rounded-lg border border-border bg-background px-2 text-sm" />
              <button onClick={() => revoke(active.id)} disabled={busy} className="h-9 rounded-lg bg-destructive px-3 text-sm font-semibold text-destructive-foreground">Confirmer le retrait</button>
              <button onClick={() => setRevoking(null)} className="h-9 rounded-lg border border-border px-3 text-sm">Annuler</button>
            </div>
          ) : (
            <button onClick={() => setRevoking(active.id)} className="mt-2 inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm">
              <ShieldOff className="h-4 w-4" /> Retirer l'autorisation
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <select aria-label="Type d'autorisation" value={kind} onChange={(e) => setKind(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-sm">
            <option value="interne">Interne (nos entreprises)</option>
            <option value="offerte">Offerte</option>
          </select>
          <input aria-label="Motif de l'autorisation" value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Motif (obligatoire)" className="h-9 min-w-[220px] flex-1 rounded-lg border border-border bg-background px-2 text-sm" />
          <button onClick={grant} disabled={busy} className="inline-flex h-9 items-center gap-1 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Accorder l'autorisation
          </button>
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-semibold text-muted-foreground">Historique privé ({logs.length})</p>
        {logs.length === 0 ? <p className="text-xs text-muted-foreground">Aucune modification.</p> : (
          <ul className="divide-y rounded-lg border border-border text-xs">
            {logs.map((l) => (
              <li key={l.id} className="p-2">
                <span className="font-semibold">{l.action}</span> · {dt(l.created_at)} · {l.actor_email ?? "—"}
                {l.changes?.reason && <> · motif : {l.changes.reason}</>}
                {l.changes?.revoke_reason && <> · motif du retrait : {l.changes.revoke_reason}</>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
