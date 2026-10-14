import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BellRing, ChevronRight, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CLOSED_RAW_STATUSES, INBOX_LABELS, inboxState, isPending, sortByUrgency,
  type InboxFollowup, type InboxState,
} from "@/lib/access-requests/inbox";
import { statusLabel } from "@/lib/access-requests/status";
import { toast } from "sonner";

interface Row {
  id: string; request_number: string | null; client_name: string | null; client_company: string | null;
  site_city: string | null; site_address: string | null; status: string | null; created_at: string;
  state: InboxState;
}

const STATE_CLASS: Record<InboxState, string> = {
  nouvelle: "bg-destructive text-destructive-foreground",
  consultee: "bg-secondary text-secondary-foreground",
  en_traitement: "bg-primary/15 text-foreground",
  traitee: "bg-muted text-muted-foreground",
};

const fmt = (d: string) => new Date(d).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Toronto" });
const age = (d: string) => {
  const h = Math.floor((Date.now() - new Date(d).getTime()) / 36e5);
  return h < 1 ? "moins d'une heure" : h < 48 ? `${h} h` : `${Math.floor(h / 24)} jours`;
};

/**
 * Accueil super admin : demandes de dompes non traitées, en temps réel
 * (abonnement + interrogation 30 s en secours). Deux compteurs distincts :
 * « Nouvelles » (jamais ouvertes) et « À traiter » (toute demande sans décision finale).
 */
export default function NewDumpRequestsPanel() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [arrived, setArrived] = useState<Row[]>([]);
  const known = useRef<Set<string> | null>(null);
  const alerted = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    // Toutes les demandes sans décision finale, sans limite d'ancienneté.
    const { data: reqs } = await supabase.from("transport_requests")
      .select("id,request_number,client_name,client_company,site_city,site_address,status,created_at")
      .or(`status.is.null,status.not.in.(${CLOSED_RAW_STATUSES.join(",")})`)
      .order("created_at", { ascending: false }).limit(1000);
    const list = reqs ?? [];
    const ids = list.map((r) => r.id);
    const fmap = new Map<string, InboxFollowup>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data: fus } = await supabase.from("request_followups")
        .select("entity_id,seen_at,taken_at,follow_status,resolved_at")
        .eq("entity_type", "transport_request").in("entity_id", ids.slice(i, i + 200));
      (fus ?? []).forEach((f: any) => fmap.set(f.entity_id, f));
    }
    const next = sortByUrgency(list.map((r) => ({ ...r, state: inboxState(r.status, fmap.get(r.id)) }))
      .filter((r) => isPending(r.state)));
    // Alerte unique pour une demande arrivée pendant que la page est ouverte.
    if (known.current) {
      const fresh = next.filter((r) => r.state === "nouvelle" && !known.current!.has(r.id) && !alerted.current.has(r.id));
      fresh.forEach((r) => {
        alerted.current.add(r.id);
        toast.warning(`Nouvelle demande de dompe ${r.request_number ?? ""}`, {
          description: r.client_name ?? undefined, duration: 20000,
        });
      });
      if (fresh.length) setArrived((a) => [...fresh, ...a]);
    }
    known.current = new Set(list.map((r) => r.id));
    setRows(next);
  }, []);

  useEffect(() => {
    void load();
    let t: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => { clearTimeout(t); t = setTimeout(() => void load(), 600); };
    const ch = supabase.channel("admin-dump-inbox-" + Math.random().toString(36).slice(2))
      .on("postgres_changes", { event: "*", schema: "public", table: "transport_requests" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "request_followups" }, schedule)
      .subscribe();
    const poll = setInterval(() => void load(), 30_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => { clearTimeout(t); clearInterval(poll); window.removeEventListener("focus", onFocus); void supabase.removeChannel(ch); };
  }, [load]);

  const unseen = rows?.filter((r) => r.state === "nouvelle").length ?? 0;
  const todo = rows?.length ?? 0;

  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = unseen ? `(${unseen}) ${base}` : base;
  }, [unseen]);

  const open = async (r: Row) => {
    setArrived((a) => a.filter((x) => x.id !== r.id));
    await supabase.rpc("request_followup_mark_seen" as any, { _entity_type: "transport_request", _entity_id: r.id });
    navigate(`/admin/demandes-acces?demande=${r.id}`);
  };

  return (
    <section aria-labelledby="new-dump-requests" className={`mb-6 rounded-xl border-2 p-4 ${unseen ? "border-destructive bg-destructive/5" : "border-border bg-card"}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="new-dump-requests" className="flex items-center gap-2 font-display text-lg font-bold">
          <BellRing className={`h-5 w-5 ${unseen ? "text-destructive animate-pulse" : "text-primary"}`} />
          Nouvelles demandes de dompes
        </h2>
        <Button variant="outline" size="sm" onClick={() => navigate("/admin/demandes-acces")}>Toutes les demandes</Button>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className={`rounded-lg border p-3 ${unseen ? "border-destructive bg-destructive text-destructive-foreground" : "border-border bg-muted/40"}`}>
          <p className="text-3xl font-bold leading-none" aria-label={`${unseen} nouvelles demandes`}>{rows ? unseen : "…"}</p>
          <p className="mt-1 text-sm font-semibold">Nouvelles</p>
          <p className={`text-xs ${unseen ? "opacity-90" : "text-muted-foreground"}`}>Jamais ouvertes</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-3xl font-bold leading-none" aria-label={`${todo} demandes à traiter`}>{rows ? todo : "…"}</p>
          <p className="mt-1 text-sm font-semibold">Demandes à traiter</p>
          <p className="text-xs text-muted-foreground">Sans décision finale (nouvelles incluses)</p>
        </div>
      </div>

      {arrived.length > 0 && (
        <div role="alert" className="mb-3 flex items-start gap-2 rounded-lg border-2 border-destructive bg-destructive p-3 text-destructive-foreground">
          <BellRing className="mt-0.5 h-5 w-5 shrink-0 animate-pulse" />
          <div className="min-w-0 flex-1">
            <p className="font-bold">{arrived.length === 1 ? "Une nouvelle demande vient d'arriver" : `${arrived.length} nouvelles demandes viennent d'arriver`}</p>
            {arrived.slice(0, 3).map((r) => (
              <button key={r.id} onClick={() => void open(r)} className="block truncate text-left text-sm underline">
                {r.request_number ?? "—"} · {r.client_name ?? "Entrepreneur"}
              </button>
            ))}
          </div>
          <button aria-label="Masquer l'alerte" onClick={() => setArrived([])}><X className="h-5 w-5" /></button>
        </div>
      )}

      {rows === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune demande à traiter.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.slice(0, 8).map((r) => (
            <li key={r.id}>
              <button onClick={() => void open(r)} className={`flex w-full items-center gap-3 rounded-md px-2 py-3 text-left hover:bg-muted/60 ${r.state === "nouvelle" ? "font-semibold" : ""}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm">{r.request_number ?? "—"}</span>
                    <Badge className={STATE_CLASS[r.state]}>{INBOX_LABELS[r.state]}</Badge>
                    <span className="text-xs text-muted-foreground">{statusLabel(r.status)}</span>
                  </div>
                  <p className="truncate text-sm">{[r.client_name, r.client_company].filter(Boolean).join(" — ") || "Entrepreneur"}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.site_city || r.site_address || "Lieu non précisé"} · {fmt(r.created_at)} · en attente depuis {age(r.created_at)}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {rows && rows.length > 8 && <p className="mt-2 text-xs text-muted-foreground">+ {rows.length - 8} autres demandes à traiter.</p>}
    </section>
  );
}
