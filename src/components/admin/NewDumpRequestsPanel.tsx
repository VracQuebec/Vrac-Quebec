import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BellRing, ChevronRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { INBOX_LABELS, inboxState, isPending, type InboxFollowup, type InboxState } from "@/lib/access-requests/inbox";
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

const fmt = (d: string) => new Date(d).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" });

/**
 * Accueil super admin : demandes de dompes non traitées, en temps réel
 * (abonnement + interrogation 30 s en secours). Reste visible jusqu'à
 * une prise en charge réelle.
 */
export default function NewDumpRequestsPanel() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[] | null>(null);
  const known = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 60 * 864e5).toISOString();
    const { data: reqs } = await supabase.from("transport_requests")
      .select("id,request_number,client_name,client_company,site_city,site_address,status,created_at")
      .gte("created_at", since).order("created_at", { ascending: false }).limit(200);
    const list = reqs ?? [];
    const ids = list.map((r) => r.id);
    const fmap = new Map<string, InboxFollowup>();
    if (ids.length) {
      const { data: fus } = await supabase.from("request_followups")
        .select("entity_id,seen_at,taken_at,follow_status,resolved_at")
        .eq("entity_type", "transport_request").in("entity_id", ids);
      (fus ?? []).forEach((f: any) => fmap.set(f.entity_id, f));
    }
    const next = list.map((r) => ({ ...r, state: inboxState(r.status, fmap.get(r.id)) }))
      .filter((r) => isPending(r.state));
    // Alerte unique pour une demande arrivée pendant que la page est ouverte.
    if (known.current) {
      next.filter((r) => r.state === "nouvelle" && !known.current!.has(r.id)).forEach((r) =>
        toast.warning(`Nouvelle demande de dompe ${r.request_number ?? ""}`, {
          description: r.client_name ?? undefined, duration: 20000,
        }));
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

  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = unseen ? `(${unseen}) ${base}` : base;
  }, [unseen]);

  const open = async (r: Row) => {
    await supabase.rpc("request_followup_mark_seen" as any, { _entity_type: "transport_request", _entity_id: r.id });
    navigate(`/admin/demandes-acces?demande=${r.id}`);
  };

  return (
    <section aria-labelledby="new-dump-requests" className={`mb-6 rounded-xl border-2 p-4 ${unseen ? "border-destructive bg-destructive/5" : "border-border bg-card"}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="new-dump-requests" className="flex items-center gap-2 font-display text-lg font-bold">
          <BellRing className={`h-5 w-5 ${unseen ? "text-destructive animate-pulse" : "text-primary"}`} />
          Nouvelles demandes de dompes
          <span aria-label={`${unseen} non consultées`} className={`ml-1 inline-flex min-w-7 items-center justify-center rounded-full px-2 py-0.5 text-sm font-bold ${unseen ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground"}`}>{unseen}</span>
        </h2>
        <Button variant="outline" size="sm" onClick={() => navigate("/admin/demandes-acces")}>Toutes les demandes</Button>
      </div>
      {rows === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune demande en attente de prise en charge.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.slice(0, 8).map((r) => (
            <li key={r.id}>
              <button onClick={() => void open(r)} className={`flex w-full items-center gap-3 rounded-md px-2 py-3 text-left hover:bg-muted/60 ${r.state === "nouvelle" ? "font-semibold" : ""}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm">{r.request_number ?? "—"}</span>
                    <Badge className={STATE_CLASS[r.state]}>{INBOX_LABELS[r.state]}</Badge>
                  </div>
                  <p className="truncate text-sm">{[r.client_name, r.client_company].filter(Boolean).join(" — ") || "Entrepreneur"}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.site_city || r.site_address || "Lieu non précisé"} · {fmt(r.created_at)}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {rows && rows.length > 8 && <p className="mt-2 text-xs text-muted-foreground">+ {rows.length - 8} autres demandes en attente.</p>}
    </section>
  );
}
