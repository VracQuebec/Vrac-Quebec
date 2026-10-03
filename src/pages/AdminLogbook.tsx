// LOG-01 — paramètres super admin : entreprises autorisées pour l'essai privé du logbook.
import { useCallback, useEffect, useState } from "react";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import PageHeader from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export default function AdminLogbook() {
  const { user, isReady } = useAuthReady();
  const { isAdmin, loading } = useUserRoles(user, isReady);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [on, setOn] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    const { data } = await supabase.from("jsc_companies").select("id,name").is("archived_at", null).order("name");
    setCompanies(data ?? []);
    const { data: t } = await supabase.from("log_trial_companies").select("company_id");
    setOn(new Set((t ?? []).map((r) => r.company_id)));
  }, []);
  useEffect(() => { if (isAdmin) void load(); }, [isAdmin, load]);
  if (!isReady || loading) return <p className="p-8 text-muted-foreground">Chargement…</p>;
  if (!isAdmin) return <p className="p-8 text-muted-foreground">Accès réservé à l’équipe Vrac Québec.</p>;
  const toggle = async (id: string) => {
    const { error } = await supabase.rpc("log_admin_set_trial", { p_company: id, p_enabled: !on.has(id) });
    setMsg(error ? `Erreur : ${error.message}` : "Confirmé par le serveur"); void load();
  };
  return <div className="min-h-screen bg-background">
    <PageHeader title="Logbook — essais privés (LOG-01)" />
    <main className="mx-auto max-w-3xl space-y-3 px-4 py-6">
      <p className="text-sm">Prototype non certifié, DCE non connecté. Seules les entreprises activées ici voient le logbook.</p>
      {msg && <p role="status" className="text-sm text-muted-foreground">{msg}</p>}
      {companies.map((c) => <div key={c.id} className="flex items-center justify-between rounded-md border border-border p-3">
        <span>{c.name}</span><Button size="sm" variant={on.has(c.id) ? "default" : "outline"} onClick={() => toggle(c.id)}>{on.has(c.id) ? "Activé — désactiver" : "Activer l'essai"}</Button>
      </div>)}
    </main>
  </div>;
}
