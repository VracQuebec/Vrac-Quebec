// Panneau d'essai des notifications téléphone — visible seulement pour les
// comptes de test (@*.invalid, .test, .example, example.com). Le serveur
// refuse aussi toute autre adresse : l'interface n'est pas la protection.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { enablePush, getPushState, sendSelfTestPush, listDevices, type PushDevice, type PushState } from "@/lib/notifications/push";
import { AppCard } from "@/components/entrepreneur-app/ui";

const isTestEmail = (e?: string | null) => {
  const v = (e ?? "").toLowerCase();
  return /\.(invalid|test|example)$/.test(v) || v.endsWith("@example.com");
};

export default function TestPushPanel() {
  const [show, setShow] = useState(false);
  const [state, setState] = useState<PushState | null>(null);
  const [devices, setDevices] = useState<PushDevice[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setState(await getPushState());
    setDevices(await listDevices().catch(() => []));
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (isTestEmail(data.user?.email)) { setShow(true); void refresh(); }
    });
  }, []);

  if (!show) return null;

  const run = async (fn: () => Promise<string>) => {
    setBusy(true); setMsg(null);
    try { setMsg(await fn()); } catch (e) { setMsg(`Erreur : ${(e as Error).message}`); }
    finally { setBusy(false); void refresh(); }
  };

  return (
    <AppCard className="space-y-3 border-dashed">
      <p className="font-display text-sm font-bold">TEST — Notifications téléphone (compte de test)</p>
      <p className="text-xs text-muted-foreground">État de cet appareil : {state ?? "…"}</p>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => run(async () => { await enablePush({}); return "Notifications activées sur cet appareil."; })}
          className="min-h-11 rounded-xl bg-secondary px-4 text-sm font-bold disabled:opacity-50">Activer les notifications</button>
        <button disabled={busy} onClick={() => run(async () => {
          const r = await sendSelfTestPush();
          return `Envoyé : ${r.sent}/${r.devices} appareil(s).${r.errors?.length ? ` Erreur réelle : ${r.errors.join(" | ")}` : ""}`;
        })} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">Envoyer un test</button>
      </div>
      {msg && <p className="text-sm">{msg}</p>}
      {devices.map((d) => (
        <p key={d.id} className="text-xs text-muted-foreground">
          Appareil : dernier succès {d.last_success_at ? new Date(d.last_success_at).toLocaleString("fr-CA") : "—"}
          {d.last_error ? ` · Erreur : ${d.last_error}` : ""}
        </p>
      ))}
    </AppCard>
  );
}
