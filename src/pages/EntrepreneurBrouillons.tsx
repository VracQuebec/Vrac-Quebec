// NAV-01B — « Reprendre mon travail » : brouillons du compte connecté (au compte + sur cet appareil).
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileClock, Cloud, Smartphone } from "lucide-react";
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { discardDraft, listDrafts, type DraftMeta } from "@/lib/drafts/draftStore";
import { closeServerDraft, listServerDrafts, serverKey, type ServerDraft } from "@/lib/drafts/serverSync";

const MODULES: Record<string, string> = { finances: "Finances", "entcrm": "CRM", crm: "CRM", admin: "Administration", flotte: "Flotte", blog: "Articles", "achat-vrac": "Achat en vrac" };
const fmt = (iso: string) => new Date(iso).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" });

type Row = { key: string; module: string; form: string; label: string; company: string | null; route: string | null; step: number | null;
  updatedAt: string; where: "compte" | "attente" | "appareil"; server?: ServerDraft; local?: DraftMeta };

export default function EntrepreneurBrouillons() {
  const { user, isReady } = useAuthReady();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const local = listDrafts(user.id).filter((m) => m.module !== "achat-vrac");
    let server: ServerDraft[] = [];
    try { server = await listServerDrafts(); setErr(null); } catch { setErr("Brouillons du compte momentanément indisponibles : seuls ceux de cet appareil sont affichés."); }
    const map = new Map<string, Row>();
    for (const s of server) map.set(s.draft_key, { key: s.draft_key, module: s.module, form: s.form, label: s.label ?? "Brouillon", company: s.company_id, route: s.route, step: s.step, updatedAt: s.updated_at, where: "compte", server: s });
    for (const m of local) {
      const k = serverKey(m); const cur = map.get(k);
      if (cur) { cur.local = m; if (m.unsynced) { cur.where = "attente"; if (m.updatedAt > cur.updatedAt) cur.updatedAt = m.updatedAt; } }
      else map.set(k, { key: k, module: m.module, form: m.form, label: m.label ?? "Brouillon", company: m.company ?? null, route: m.route ?? null, step: m.step ?? null, updatedAt: m.updatedAt, where: m.serverRev == null && !m.unsynced ? "appareil" : "attente", local: m });
    }
    const list = [...map.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    setRows(list);
    const ids = [...new Set(list.map((r) => r.company).filter(Boolean))] as string[];
    if (ids.length) {
      const { data } = await supabase.from("jsc_companies").select("id,name").in("id", ids);
      setNames(Object.fromEntries((data ?? []).map((c: { id: string; name: string }) => [c.id, c.name])));
    }
  }, [user]);
  useEffect(() => { if (isReady) void load(); }, [isReady, load]);

  const abandon = async (r: Row) => {
    if (!window.confirm(`Abandonner « ${r.label} » ? Les informations saisies seront effacées. Aucune opération déjà enregistrée n'est annulée.`)) return;
    if (r.local) discardDraft(r.local.key);
    if (r.server || r.local?.serverRev != null) {
      const s = r.server; const id = s ? { owner: user!.id, module: s.module, form: s.form, company: s.company_id, recordId: s.record_id, instance: s.instance } : r.local!;
      try { await closeServerDraft(id, "discarded"); } catch { setErr("Abandon non transmis au compte (réseau). Réessayez."); }
    }
    void load();
  };

  return (
    <EntrepreneurAppShell title="Reprendre mon travail" subtitle="Vos brouillons" allowCompanyMembers>
      <div className="mx-auto w-full max-w-3xl space-y-3 px-4 py-5 sm:px-6">
        <p className="text-sm text-muted-foreground">Un brouillon n'est jamais envoyé ni enregistré comme opération : il garde seulement ce que vous avez saisi.</p>
        {err && <p role="alert" className="rounded-md bg-secondary p-2 text-sm">{err}</p>}
        {!rows ? <p className="text-muted-foreground">Chargement…</p>
          : !rows.length ? <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Aucun brouillon en cours.</p>
          : <ul className="space-y-2" aria-label="Brouillons">
            {rows.map((r) => (
              <li key={r.key} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3" data-testid="draft-row">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-semibold"><FileClock className="h-4 w-4 text-primary" />{r.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {MODULES[r.module] ?? r.module}{r.company ? ` · ${names[r.company] ?? "Entreprise"}` : ""}{r.step != null ? ` · étape ${r.step + 1}` : ""} · {fmt(r.updatedAt)}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs" data-where={r.where}>
                    {r.where === "compte" ? <><Cloud className="h-3 w-3" />Synchronisé au compte</> : r.where === "attente" ? <><Smartphone className="h-3 w-3" />Sur cet appareil — synchronisation en attente</> : <><Smartphone className="h-3 w-3" />Sur cet appareil seulement</>}
                  </p>
                </div>
                <div className="flex gap-2">
                  {r.route ? <Button asChild size="sm"><Link to={r.route}>Reprendre</Link></Button> : <Button size="sm" disabled>Reprendre</Button>}
                  <Button size="sm" variant="outline" onClick={() => void abandon(r)}>Abandonner</Button>
                </div>
              </li>
            ))}
          </ul>}
      </div>
    </EntrepreneurAppShell>
  );
}
