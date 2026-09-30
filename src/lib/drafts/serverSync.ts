// NAV-01B — Synchronisation des brouillons au compte (table user_drafts, RPC draft_*).
// Le serveur déduit l'utilisateur du jeton et vérifie l'accès à l'entreprise.
// Codes : P0409 = conflit de version, P0410 = brouillon déjà finalisé/abandonné (écriture refusée).
import { supabase } from "@/integrations/supabase/client";
import type { DraftIdentity } from "./draftStore";

export type ServerDraft = {
  draft_key: string; company_id: string | null; module: string; form: string; record_id: string | null;
  instance: string; label: string | null; route: string | null; step: number | null; data: unknown;
  rev: number; status: "active" | "finalized" | "discarded"; updated_at: string;
};

/** Clé serveur : indépendante du domaine (aperçu / site) pour la reprise sur un autre appareil. */
export function serverKey(id: DraftIdentity) {
  return [id.company || "-", id.module, id.form, id.recordId || "new", id.instance || "main"].join("|");
}
export const isSynced = (id: DraftIdentity | null) => !!id && !!id.owner && id.owner !== "anon";

export class DraftSyncError extends Error {
  constructor(public kind: "conflict" | "closed" | "offline" | "denied" | "other", msg: string) { super(msg); }
}
const classify = (e: { code?: string; message?: string } | null): DraftSyncError => {
  const code = e?.code ?? ""; const msg = e?.message ?? "Erreur";
  if (code === "P0409") return new DraftSyncError("conflict", msg);
  if (code === "P0410") return new DraftSyncError("closed", msg);
  if (code === "42501") return new DraftSyncError("denied", msg);
  if (!code || /fetch|network|Failed/i.test(msg)) return new DraftSyncError("offline", msg);
  return new DraftSyncError("other", msg);
};

export async function fetchServerDraft(id: DraftIdentity): Promise<ServerDraft | null> {
  const { data, error } = await supabase.from("user_drafts" as never).select("draft_key,company_id,module,form,record_id,instance,label,route,step,data,rev,status,updated_at")
    .eq("draft_key", serverKey(id)).maybeSingle();
  if (error) throw classify(error);
  return (data as ServerDraft | null) ?? null;
}

export async function listServerDrafts(): Promise<ServerDraft[]> {
  const { data, error } = await supabase.from("user_drafts" as never).select("draft_key,company_id,module,form,record_id,instance,label,route,step,data,rev,status,updated_at")
    .eq("status", "active").order("updated_at", { ascending: false }).limit(200);
  if (error) throw classify(error);
  return (data as ServerDraft[]) ?? [];
}

export async function saveServerDraft(id: DraftIdentity, baseRev: number | null, data: unknown, extra: { label?: string; route?: string; step?: number | null }) {
  const args = {
    _key: serverKey(id), _base_rev: baseRev, _module: id.module, _form: id.form, _company: id.company ?? null,
    _record: id.recordId ?? null, _instance: id.instance ?? "main", _label: extra.label ?? null,
    _route: extra.route ?? null, _step: extra.step ?? null, _data: data, _schema: 1,
  };
  const { data: res, error } = await supabase.rpc("draft_save" as never, args as never);
  if (error) throw classify(error);
  return res as unknown as { rev: number; updated_at: string };
}

export async function closeServerDraft(id: DraftIdentity, status: "finalized" | "discarded") {
  const { error } = await supabase.rpc("draft_close" as never, { _key: serverKey(id), _status: status } as never);
  if (error) throw classify(error);
}

export async function reopenServerDraft(id: DraftIdentity) {
  const { error } = await supabase.rpc("draft_reopen" as never, { _key: serverKey(id) } as never);
  if (error) throw classify(error);
}

// Clôtures non transmises (hors ligne) : rejouées au retour du réseau; bloquent toute réécriture.
const CLOSE_Q = "vq.draftCloseQueue";
type Pending = { owner: string; id: DraftIdentity; status: "finalized" | "discarded" };
const readQ = (): Pending[] => { try { return JSON.parse(localStorage.getItem(CLOSE_Q) || "[]"); } catch { return []; } };
const writeQ = (q: Pending[]) => { try { localStorage.setItem(CLOSE_Q, JSON.stringify(q)); } catch { /* ignore */ } };
export function queueClose(p: Pending) { writeQ([...readQ().filter((x) => serverKey(x.id) !== serverKey(p.id) || x.owner !== p.owner), p]); }
export function isCloseQueued(owner: string, id: DraftIdentity) { return readQ().some((x) => x.owner === owner && serverKey(x.id) === serverKey(id)); }
export async function flushCloseQueue(owner: string) {
  const q = readQ(); const keep: Pending[] = [];
  for (const p of q) {
    if (p.owner !== owner) { keep.push(p); continue; }
    try { await closeServerDraft(p.id, p.status); } catch (e) { if ((e as DraftSyncError).kind === "offline") keep.push(p); }
  }
  writeQ(keep);
}
