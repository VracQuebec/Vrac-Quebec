import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Accès « Administration — Lecture seule ».
 * Garde navigateur = confort d'interface seulement : l'autorité reste le serveur
 * (aucune politique d'écriture pour ce compte, fonctions admin réservées à has_role admin).
 */
let active = false;
let installed = false;
const MSG = "Accès en lecture seule : cette action n'est pas autorisée.";
const WRITE_RPC = /(^|_)(create|update|delete|set|assign|approve|decide|send|mark|archive|cancel|confirm|respond|merge|import|start|retry|pause|resume|propose|adopt|upsert|insert|toggle|void|add|remove|record|save|publish|apply|restore|purge|reject|accept|enqueue|dispatch|grant|revoke|close|open|reopen|bump|link|unlink|move|claim|release|validate|generate|run|sweep)(_|$)/i;

export const isAdminReadonlyActive = () => active;

type RpcFn = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ error: unknown }>;
let rawRpc: RpcFn | null = null;

export function logAdminReadonly(action: string, section?: string | null, resourceType?: string | null,
  resourceId?: string | null, result: "reussi" | "refuse" | "erreur" = "reussi", detail: Record<string, unknown> = {}) {
  if (!active) return;
  const call = rawRpc ?? (supabase.rpc.bind(supabase) as unknown as RpcFn);
  void Promise.resolve(call("adm_ro_log", {
    _action: action, _section: section ?? null, _resource_type: resourceType ?? null,
    _resource_id: resourceId ?? null, _result: result, _detail: detail,
  })).catch(() => undefined);
}

function refused(kind: string, target: string) {
  toast.error(MSG);
  logAdminReadonly("action_interdite", currentSection(), kind, target, "refuse", { bloque: "interface" });
  const res = { data: null, error: { message: MSG, code: "42501", details: "", hint: "" }, status: 403, statusText: "Lecture seule", count: null };
  const p: unknown = new Proxy(function () { /* chaîne neutre */ }, {
    get(_t, k) {
      if (k === "then") return (a: never, b: never) => Promise.resolve(res).then(a, b);
      if (k === "catch" || k === "finally") return (...x: never[]) => (Promise.resolve(res) as any)[k](...x);
      return () => p;
    },
    apply() { return p; },
  });
  return p;
}

const currentSection = () => (typeof window !== "undefined" ? window.location.pathname : null);

function install() {
  if (installed) return;
  installed = true;
  const anyClient = supabase as any;
  const origFrom = anyClient.from.bind(supabase);
  anyClient.from = (table: string) => {
    const qb = origFrom(table);
    if (!active) return qb;
    for (const m of ["insert", "update", "upsert", "delete"]) {
      const orig = qb[m]?.bind(qb);
      if (orig) qb[m] = () => refused(`table:${m}`, table);
    }
    return qb;
  };
  const origRpc = anyClient.rpc.bind(supabase);
  rawRpc = origRpc;
  anyClient.rpc = (fn: string, args?: unknown, opts?: unknown) => {
    if (active && !fn.startsWith("adm_ro_") && WRITE_RPC.test(fn)) return refused("rpc", fn);
    return origRpc(fn, args, opts);
  };
  const origStorageFrom = anyClient.storage.from.bind(anyClient.storage);
  anyClient.storage.from = (bucket: string) => {
    const b = origStorageFrom(bucket);
    if (!active) return b;
    for (const m of ["upload", "update", "remove", "move", "copy", "uploadToSignedUrl"]) {
      if (b[m]) b[m] = () => refused(`stockage:${m}`, bucket);
    }
    const dl = b.download?.bind(b);
    if (dl) b.download = (path: string, ...rest: unknown[]) => { logAdminReadonly("document_telechargement", currentSection(), "stockage", bucket); return dl(path, ...rest); };
    const signed = b.createSignedUrl?.bind(b);
    if (signed) b.createSignedUrl = (path: string, ...rest: unknown[]) => { logAdminReadonly("document_ouverture", currentSection(), "stockage", bucket); return signed(path, ...rest); };
    return b;
  };
  const origInvoke = anyClient.functions.invoke.bind(anyClient.functions);
  anyClient.functions.invoke = async (name: string, opts?: unknown) => {
    const r = await origInvoke(name, opts);
    if (active) logAdminReadonly("fonction_serveur", currentSection(), "fonction", name, r?.error ? "refuse" : "reussi");
    return r;
  };
}

export function setAdminReadonly(on: boolean, _uid?: string) {
  if (on) install();
  active = on;
}
