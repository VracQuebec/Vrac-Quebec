import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Accès « Administration — Lecture seule ».
 * - Toutes les lectures passent par le relais serveur adm-ro-proxy (journal serveur, identité de la session).
 *   Sans ce relais, la base ne donne aucune donnée à ce compte.
 * - Documents privés : fonction secure-file (journal serveur).
 * - Garde navigateur = confort d'interface seulement; l'autorité reste le serveur.
 */
let active = false;
let installed = false;
const MSG = "Accès en lecture seule : cette action n'est pas autorisée.";
const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string;
const WRITE_RPC = /(^|_)(create|update|delete|set|assign|approve|decide|send|mark|archive|cancel|confirm|respond|merge|import|start|retry|pause|resume|propose|adopt|upsert|insert|toggle|void|add|remove|record|save|publish|apply|restore|purge|reject|accept|enqueue|dispatch|grant|revoke|close|reopen|bump|link|unlink|move|claim|release|validate|generate|run|sweep)(_|$)/i;

export const isAdminReadonlyActive = () => active;

type RpcFn = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ error: unknown }>;
let rawRpc: RpcFn | null = null;
const currentSection = () => (typeof window !== "undefined" ? window.location.pathname : null);

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

async function secureFile(bucket: string, path: string): Promise<Blob> {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(`${SUPA_URL}/functions/v1/secure-file`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string },
    body: JSON.stringify({ bucket, path, section: currentSection() }),
  });
  if (!r.ok) throw new Error("Accès refusé");
  return r.blob();
}

// Toute requête de données du client est réécrite vers le relais serveur journalisé.
function proxiedFetch(orig: typeof fetch): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    if (!active) return orig(input, init);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const next = url.replace(`${SUPA_URL}/rest/v1`, `${SUPA_URL}/functions/v1/adm-ro-proxy`);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set("x-adm-ro-section", (currentSection() ?? "").slice(0, 120));
    return orig(next, { ...init, headers });
  };
}

function install() {
  if (installed) return;
  installed = true;
  const anyClient = supabase as any;
  if (anyClient.rest?.fetch) anyClient.rest.fetch = proxiedFetch(anyClient.rest.fetch);
  const origFrom = anyClient.from.bind(supabase);
  anyClient.from = (table: string) => {
    const qb = origFrom(table);
    if (!active) return qb;
    for (const m of ["insert", "update", "upsert", "delete"]) if (qb[m]) qb[m] = () => refused(`table:${m}`, table);
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
    for (const m of ["upload", "update", "remove", "move", "copy", "uploadToSignedUrl"]) if (b[m]) b[m] = () => refused(`stockage:${m}`, bucket);
    b.download = async (path: string) => { try { return { data: await secureFile(bucket, path), error: null }; } catch (e) { return { data: null, error: e }; } };
    b.createSignedUrl = async (path: string) => {
      try { return { data: { signedUrl: URL.createObjectURL(await secureFile(bucket, path)) }, error: null }; } catch (e) { return { data: null, error: e }; }
    };
    b.createSignedUrls = async (paths: string[]) => ({ data: await Promise.all(paths.map(async p => { try { return { path: p, signedUrl: URL.createObjectURL(await secureFile(bucket, p)), error: null }; } catch { return { path: p, signedUrl: "", error: "Accès refusé" }; } })), error: null });
    return b;
  };
}

// Commandes d'écriture désactivées et signalées (le serveur refuse de toute façon).
const WRITE_LABEL = /^(\+\s*)?(ajouter|nouveau|nouvelle|créer|creer|modifier|éditer|editer|supprimer|archiver|désarchiver|restaurer|enregistrer|sauvegarder|assigner|attribuer|réassigner|valider|approuver|refuser|accepter|rejeter|confirmer|envoyer|renvoyer|relancer|publier|dépublier|importer|téléverser|téléverse|joindre|déposer|lancer|démarrer|planifier|générer|regénérer|dupliquer|fusionner|inviter|révoquer|payer|encaisser|rembourser|marquer|changer|activer|désactiver|suspendre|reprendre|annuler la|annuler l|clôturer|fermer le dossier|prendre en charge|résoudre|appliquer|synchroniser|recalculer|convertir|transférer|déplacer|retirer|émettre|facturer|signer|corriger|arrêter|ajuster|mettre à jour|choisir ce|retenir)\b/i;
let observer: MutationObserver | null = null;
function markControls(root: ParentNode) {
  root.querySelectorAll<HTMLElement>("button, [role=menuitem], [role=menuitemradio], a[role=button], input[type=submit], input[type=file]").forEach(el => {
    if (el.dataset.roChecked) return;
    el.dataset.roChecked = "1";
    const texts = [el.getAttribute("aria-label"), el.textContent, (el as HTMLInputElement).value, el.getAttribute("title")]
      .map(t => (t || "").trim()).filter(Boolean);
    const isFile = el instanceof HTMLInputElement && el.type === "file";
    if (isFile || texts.some(t => WRITE_LABEL.test(t)) || el.dataset.roWrite === "1") {
      el.setAttribute("aria-disabled", "true");
      el.setAttribute("title", "Lecture seule");
      if ("disabled" in el) (el as HTMLButtonElement).disabled = true;
      el.classList.add("pointer-events-none", "opacity-40");
    }
  });
}
function startUiLock() {
  if (observer || typeof document === "undefined") return;
  document.documentElement.dataset.adminReadonly = "1";
  markControls(document);
  observer = new MutationObserver(muts => { for (const m of muts) m.addedNodes.forEach(n => { if (n instanceof HTMLElement) { markControls(n.parentElement ?? n); } }); });
  observer.observe(document.body, { childList: true, subtree: true });
}
function stopUiLock() { observer?.disconnect(); observer = null; delete document.documentElement.dataset.adminReadonly; }

export function setAdminReadonly(on: boolean, _uid?: string) {
  if (on) install();
  active = on;
  if (typeof document !== "undefined") { if (on) startUiLock(); else stopUiLock(); }
}
