// CRM-03 — Vue « À traiter aujourd'hui » : actions échues et du jour.
// Aucune relance n'est envoyée automatiquement ; l'équipe enregistre ce qu'elle a fait.
import { useEffect, useMemo, useState } from "react";
import { Loader2, CalendarClock, CheckCircle2, History } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  completeFollowUp, countBuckets, dueBucket, fetchLeadHistory, fetchTodayFollowUps,
  outcomeLabel, sortOpenActions, OUTCOMES,
  type FollowUpActivity, type FollowUpLead,
} from "@/lib/crm/followups";

const dateLabel = (v: string | null) =>
  v ? new Intl.DateTimeFormat("fr-CA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(v)) : "—";

function LeadRow({ lead, userId, onDone }: { lead: FollowUpLead; userId: string | null; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<string>(OUTCOMES[0].value);
  const [note, setNote] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<FollowUpActivity[] | null>(null);
  const bucket = dueBucket(lead.next_follow_up_at);

  const save = async () => {
    setSaving(true);
    try {
      await completeFollowUp({
        leadId: lead.id, dueAt: lead.next_follow_up_at, outcome,
        note: note.trim() || undefined, nextDate: nextDate || null, userId,
      });
      toast({
        title: "Relance enregistrée",
        description: nextDate ? "La prochaine action est planifiée." : "Aucune action suivante planifiée.",
      });
      onDone();
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Enregistrement impossible", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const loadHistory = async () => {
    if (history) { setHistory(null); return; }
    try { setHistory(await fetchLeadHistory(lead.id)); }
    catch { toast({ title: "Erreur", description: "Historique indisponible", variant: "destructive" }); }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display font-semibold text-foreground truncate">
            {lead.name || "Sans nom"}{lead.dompe_number ? ` — ${lead.dompe_number}` : ""}
          </p>
          <p className="text-xs text-muted-foreground font-body truncate">
            {lead.city || lead.address || "Lieu non précisé"} · statut : {lead.status}
          </p>
        </div>
        <span
          className={`text-xs px-2 py-1 rounded-full border font-body ${
            bucket === "overdue"
              ? "bg-destructive/10 text-destructive border-destructive/30"
              : "bg-primary/10 text-primary border-primary/30"
          }`}
        >
          {bucket === "overdue" ? "En retard" : "Aujourd'hui"} · {dateLabel(lead.next_follow_up_at)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)}
          className="min-h-[44px] px-3 rounded-lg bg-primary text-primary-foreground text-sm font-display font-semibold">
          {open ? "Fermer" : "Terminer et planifier"}
        </button>
        <button type="button" onClick={loadHistory}
          className="min-h-[44px] px-3 rounded-lg border border-border text-sm font-display font-semibold inline-flex items-center gap-2">
          <History className="w-4 h-4" /> Historique
        </button>
      </div>

      {open && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-muted-foreground font-body">
            Résultat de l'action
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)}
              className="mt-1 w-full min-h-[44px] px-3 rounded-lg border border-border bg-background text-sm text-foreground">
              {OUTCOMES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted-foreground font-body">
            Prochaine action (laisser vide si aucune)
            <input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)}
              className="mt-1 w-full min-h-[44px] px-3 rounded-lg border border-border bg-background text-sm text-foreground" />
          </label>
          <label className="text-xs text-muted-foreground font-body sm:col-span-2">
            Note (facultative)
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground" />
          </label>
          <div className="sm:col-span-2">
            <button type="button" disabled={saving} onClick={save}
              className="min-h-[44px] px-4 rounded-lg bg-primary text-primary-foreground text-sm font-display font-semibold inline-flex items-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Enregistrer
            </button>
          </div>
        </div>
      )}

      {history && (
        <ul className="mt-3 space-y-1 border-t border-border pt-2">
          {history.length === 0 && <li className="text-xs text-muted-foreground font-body">Aucun historique.</li>}
          {history.map((h) => (
            <li key={h.id} className="text-xs text-muted-foreground font-body">
              {dateLabel(h.completed_at ?? h.created_at)} — {h.completed_at ? outcomeLabel(h.outcome) : "Action planifiée"}
              {h.due_at ? ` (prévue le ${dateLabel(h.due_at)})` : ""}
              {h.body ? ` · ${h.body}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function TodayPanel({ userId }: { userId: string | null }) {
  const [rows, setRows] = useState<FollowUpLead[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetchTodayFollowUps()
      .then(setRows)
      .catch((e) => toast({ title: "Erreur", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const ordered = useMemo(() => sortOpenActions(rows ?? []), [rows]);
  const counts = useMemo(() => countBuckets(ordered), [ordered]);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm font-body">
        <CalendarClock className="w-4 h-4 text-primary" />
        <span className="font-display font-semibold text-foreground">À traiter aujourd'hui : {counts.total}</span>
        <span className="text-destructive">{counts.overdue} en retard</span>
        <span className="text-muted-foreground">{counts.today} prévues aujourd'hui</span>
      </div>
      {ordered.length === 0 ? (
        <p className="text-sm text-muted-foreground font-body py-10 text-center">Aucune action à traiter aujourd'hui.</p>
      ) : (
        ordered.map((lead) => <LeadRow key={lead.id} lead={lead} userId={userId} onDone={load} />)
      )}
    </div>
  );
}
