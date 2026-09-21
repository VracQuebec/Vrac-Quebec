import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Loader2, RefreshCw, Sparkles, TrendingUp, TrendingDown, Phone, MessageCircle, Mail,
  FileText, ExternalLink, Zap, X, Check, ChevronDown, ChevronRight, CircleHelp, History,
} from "lucide-react";
import { toast } from "sonner";
import { useCopilot, SCAN_STEPS, type Opportunity, type OpportunityPriority } from "@/lib/seo/useCopilot";
import {
  buildActionGroups,
  buildPriorityPagesForAction,
  impactPotentialOf,
  type ActionGroup,
  type ActionPriorityPage,
} from "@/lib/seo/actionGroups";
import OpportunityWorkPanel from "@/components/seo/OpportunityWorkPanel";
import { capabilityOfGroup, capabilityOfType, workButtonLabel, natureOfType, actionStatusLabel } from "@/lib/seo/workflow";
import VerificationPanel from "@/components/seo/VerificationPanel";
import { buildCopilotCounters, countersExplanation } from "@/lib/seo/counters";
import { VERIFICATION_LABEL, verificationButtonLabel, verificationKindOfType, type VerificationKind } from "@/lib/seo/verification";

type StatusSetter = (id: string, s: "dismissed" | "in_progress" | "completed" | "open" | "error", extra?: { error?: string | null; reason?: string | null }) => Promise<void>;

const PRIORITY: Record<OpportunityPriority, { label: string; cls: string }> = {
  critical: { label: "CRITIQUE", cls: "bg-destructive text-destructive-foreground" },
  high: { label: "HAUTE", cls: "bg-primary text-primary-foreground" },
  medium: { label: "MOYENNE", cls: "bg-secondary text-secondary-foreground" },
  low: { label: "FAIBLE", cls: "bg-muted text-muted-foreground" },
};

const TYPE_LABEL: Record<string, string> = {
  high_impr_low_ctr: "Impressions élevées / clics faibles",
  ctr_top10: "CTR faible en top 10",
  position_gain: "Gain de position possible",
  not_indexed: "Publiée non indexée",
  not_indexed_bulk: "Indexation — constat global",
  converting_page: "Page qui convertit",
  local_potential: "Potentiel territoire × service",
  low_qa: "Qualité SEO faible",
  cannibalization: "Cannibalisation à vérifier",
  group_service: "Groupe — service",
  group_territory: "Groupe — territoire",
};

type FilterKey =
  | "all" | "critical" | "high" | "medium"
  | "technique" | "ctr" | "position" | "conversion"
  | "indexation" | "cannibalisation" | "territoire_service" | "groupe";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "Toutes" },
  { key: "critical", label: "Critiques" },
  { key: "high", label: "Hautes" },
  { key: "medium", label: "Moyennes" },
  { key: "technique", label: "SEO technique" },
  { key: "ctr", label: "CTR" },
  { key: "position", label: "Position" },
  { key: "conversion", label: "Conversion" },
  { key: "indexation", label: "Indexation" },
  { key: "cannibalisation", label: "Cannibalisation" },
  { key: "territoire_service", label: "Territoire × service" },
  { key: "groupe", label: "Groupes" },
];

function matchFilter(o: Opportunity, f: FilterKey): boolean {
  if (f === "all") return true;
  if (f === "critical" || f === "high" || f === "medium") return o.priority === f;
  return o.category === f;
}

function KpiCard({ label, value, icon: Icon, hint }: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }>; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-body">
        <Icon className="w-4 h-4" /> {label}
      </div>
      <div className="text-2xl font-display font-bold text-foreground mt-1">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function fmt(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "number") return Number.isInteger(value) ? value.toLocaleString("fr-CA") : value.toFixed(2);
  if (Array.isArray(value)) return value.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function fmtNum(value: number | null | undefined): string {
  return value == null ? "—" : value.toLocaleString("fr-CA");
}

function fmtPct(value: number | null | undefined): string {
  return value == null ? "—" : `${(value * 100).toFixed(2)} %`;
}

function fmtPos(value: number | null | undefined): string {
  return value == null ? "—" : value.toFixed(1);
}

function OpportunityRow({ o, rank, onStatus, onWork, onDismiss }: { o: Opportunity; rank?: number; onStatus: StatusSetter; onWork: (o: Opportunity) => void; onDismiss: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const p = PRIORITY[o.priority] ?? PRIORITY.medium;
  const conversions = Number((o.data as Record<string, unknown> | null)?.conversions ?? 0);
  return (
    <li className="p-4">
      <div className="flex items-start justify-between gap-3">
        <button onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {rank != null && <span className="text-[10px] font-display font-bold text-muted-foreground">#{rank}</span>}
            <span className={`px-2 py-0.5 rounded text-[10px] font-display font-bold tracking-wider ${p.cls}`}>{p.label}</span>
            {conversions > 0 && (
              <span className="px-2 py-0.5 rounded text-[10px] font-display font-bold bg-primary/15 text-primary">
                {conversions} CONVERSION{conversions > 1 ? "S" : ""}
              </span>
            )}
            {o.data_quality && o.data_quality !== "suffisante" && (
              <span className="text-[10px] uppercase text-muted-foreground">donnée {o.data_quality}</span>
            )}
            <span className="px-2 py-0.5 rounded border border-border text-[10px] uppercase tracking-wider font-display font-bold text-muted-foreground">
              {natureOfType(o.type) === "verification"
                ? `VÉRIFICATION — ${VERIFICATION_LABEL[verificationKindOfType(o.type) ?? "qa"]}`
                : `ACTION — ${TYPE_LABEL[o.type] ?? o.type.replace(/_/g, " ")}`}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {natureOfType(o.type) === "verification" ? "" : actionStatusLabel(o.status)}
            </span>
            <span className="text-[10px] text-muted-foreground">Score {o.score}/100 · Effort {o.effort_score}</span>
            {o.status === "in_progress" && <span className="text-[10px] text-primary font-semibold">EN COURS</span>}
          </div>
          <div className="font-display font-semibold text-foreground flex items-center gap-1">
            {open ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
            {o.title}
          </div>
          {o.url && <div className="text-xs font-mono text-muted-foreground truncate mt-0.5">{o.url}</div>}
          <div className="text-sm text-muted-foreground mt-1">{o.reason ?? o.rationale}</div>
        </button>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <button onClick={() => onWork(o)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-display font-semibold hover:opacity-90">
            <Zap className="w-3.5 h-3.5" />
            {natureOfType(o.type) === "verification" ? verificationButtonLabel("idle") : workButtonLabel(o.status, capabilityOfType(o.type))}
          </button>
          {o.status === "dismissed" && (
            <button onClick={() => void onStatus(o.id, "open")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <Check className="w-3 h-3" /> Réouvrir
            </button>
          )}
          {o.status !== "dismissed" && (
            <button onClick={() => onDismiss(o.id)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <X className="w-3 h-3" /> Ignorer
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-3 grid gap-3 md:grid-cols-2 rounded-md border border-border bg-secondary/30 p-3 text-xs">
          <div>
            <div className="font-display font-bold text-foreground mb-1">Données sources</div>
            <ul className="space-y-0.5">
              {Object.entries(o.data ?? {}).map(([k, v]) => (
                <li key={k} className="text-muted-foreground"><span className="text-foreground">{k}</span> : {fmt(v)}</li>
              ))}
              {Object.keys(o.data ?? {}).length === 0 && <li className="text-muted-foreground">Aucune donnée détaillée.</li>}
            </ul>
          </div>
          <div className="space-y-2">
            <div>
              <div className="font-display font-bold text-foreground mb-1">Action recommandée</div>
              <p className="text-muted-foreground">{o.recommended_action ?? "—"}</p>
            </div>
            {o.expected_impact && (
              <div>
                <div className="font-display font-bold text-foreground mb-1">Impact attendu</div>
                <p className="text-muted-foreground">{o.expected_impact}</p>
              </div>
            )}
            {(o.score_factors?.length ?? 0) > 0 && (
              <div>
                <div className="font-display font-bold text-foreground mb-1">Pourquoi cette priorité ? (score {o.score}/100)</div>
                <ul className="space-y-0.5">
                  {o.score_factors.map((f, i) => (
                    <li key={`${f.label}-${i}`} className="text-muted-foreground flex justify-between gap-2">
                      <span>{f.label}</span>
                      <span className={f.points >= 0 ? "text-primary font-semibold" : "text-destructive font-semibold"}>
                        {f.points > 0 ? "+" : ""}{f.points}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="text-muted-foreground">
              <div><span className="text-foreground">Source :</span> {o.source ?? "—"}</div>
              <div><span className="text-foreground">Détectée le :</span> {new Date(o.detected_at).toLocaleString("fr-CA")}</div>
              <div><span className="text-foreground">Vue pour la dernière fois :</span> {new Date(o.last_seen_at).toLocaleString("fr-CA")}</div>
            </div>
            {o.entity_slug && !o.url && <div className="font-mono text-muted-foreground">{o.entity_slug}</div>}
            {o.url && (
              <a href={o.url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                <ExternalLink className="w-3 h-3" /> Ouvrir la page
              </a>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

const KIND_LABEL: Record<ActionGroup["kind"], string> = {
  page: "PAGE",
  territoire_service: "TERRITOIRE × SERVICE",
  service: "SERVICE",
  groupe: "GROUPE",
  technique: "TECHNIQUE",
};

const IMPACT_CLS: Record<ReturnType<typeof impactPotentialOf>["label"], string> = {
  ÉLEVÉ: "bg-primary/15 text-primary border-primary/30",
  MOYEN: "bg-secondary text-secondary-foreground border-border",
  FAIBLE: "bg-muted text-muted-foreground border-border",
};

function PriorityPagesList({ pages, limit = 10 }: { pages: ActionPriorityPage[]; limit?: number }) {
  const visible = pages.slice(0, limit);
  return (
    <div className="rounded-md border border-border p-3 text-xs space-y-2">
      <div className="font-display font-bold text-foreground">Pages prioritaires</div>
      {visible.length === 0 ? (
        <div className="text-muted-foreground">Aucune page prioritaire détaillée disponible dans les données sources.</div>
      ) : (
        <ol className="space-y-2">
          {visible.map((page, i) => (
            <li key={page.page_id ?? page.slug ?? page.url ?? i} className="grid gap-1 rounded-md bg-secondary/30 p-2">
              <div className="flex items-start gap-2">
                <span className="font-display font-bold text-muted-foreground">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  <div className="font-display font-semibold text-foreground truncate">{page.title ?? page.slug ?? page.url ?? "Page sans titre"}</div>
                  <div className="font-mono text-muted-foreground truncate">{page.url ?? "—"}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground pl-5">
                <span>Territoire {page.city ?? "—"}</span>
                <span>Service {page.service ?? "—"}</span>
                <span>{fmtNum(page.impressions)} impressions</span>
                <span>{fmtNum(page.clicks)} clics</span>
                <span>CTR {fmtPct(page.ctr)}</span>
                <span>Position {fmtPos(page.position)}</span>
                <span>{fmtNum(page.conversions)} conversion{(page.conversions ?? 0) > 1 ? "s" : ""}</span>
              </div>
              <div className="pl-5 text-muted-foreground"><span className="text-foreground">Raison :</span> {page.reason}</div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function PriorityPagesPreview({ pages, limit }: { pages: ActionPriorityPage[]; limit: number }) {
  const visible = pages.slice(0, limit);
  if (visible.length === 0) return null;
  return (
    <div className="mt-3 rounded-md border border-border bg-secondary/20 p-3 text-xs space-y-2">
      <div className="font-display font-bold text-foreground">Pages prioritaires</div>
      <ol className="space-y-1.5">
        {visible.map((page, i) => (
          <li key={page.page_id ?? page.slug ?? page.url ?? i} className="grid gap-0.5">
            <div className="flex gap-2 min-w-0">
              <span className="font-display font-bold text-muted-foreground">{i + 1}.</span>
              <span className="font-mono text-muted-foreground truncate">{page.url ?? "—"}</span>
            </div>
            <div className="pl-5 text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
              <span>{fmtNum(page.impressions)} impressions</span>
              <span>{fmtNum(page.clicks)} clics</span>
              <span>CTR {fmtPct(page.ctr)}</span>
              <span>Position {fmtPos(page.position)}</span>
              <span>{fmtNum(page.conversions)} conversion{(page.conversions ?? 0) > 1 ? "s" : ""}</span>
              <span>{page.reason}</span>
            </div>
          </li>
        ))}
      </ol>
      {pages.length > visible.length && <div className="text-muted-foreground">+{pages.length - visible.length} page(s) prioritaire(s) visible(s) dans le détail.</div>}
    </div>
  );
}

function ActionGroupCard({ g, rank, priorityPages, onStatus, onWork, onDismiss }: { g: ActionGroup; rank: number; priorityPages: ActionPriorityPage[]; onStatus: StatusSetter; onWork: (g: ActionGroup) => void; onDismiss: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const p = PRIORITY[g.priority] ?? PRIORITY.medium;
  const o = g.primary;
  const impact = impactPotentialOf(g);
  const hasConversions = (g.conversions ?? 0) > 0;
  const pageCountText = g.kind === "page" ? "Cette action concerne 1 page." : `Cette action concerne ${g.pages || "—"} pages.`;
  return (
    <li className="p-4">
      <div className="flex items-start justify-between gap-3">
        <button onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[10px] font-display font-bold text-muted-foreground">#{rank}</span>
            <span className="text-[10px] font-display font-bold text-muted-foreground">SCORE {g.score}</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-display font-bold tracking-wider ${p.cls}`}>{p.label}</span>
            <span className="px-2 py-0.5 rounded border border-border text-[10px] uppercase tracking-wider font-display font-bold text-muted-foreground">{KIND_LABEL[g.kind]}</span>
            <span className="px-2 py-0.5 rounded border border-border text-[10px] uppercase tracking-wider font-display font-bold text-foreground" data-testid="nature-badge">
              {natureOfType(o.type) === "verification"
                ? `VÉRIFICATION — ${VERIFICATION_LABEL[verificationKindOfType(o.type) ?? "qa"]}`
                : `ACTION — ${g.actionLabel}`}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {natureOfType(o.type) === "verification" ? "À vérifier" : actionStatusLabel(o.status)}
            </span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-display font-bold ${g.singleAction ? "bg-primary/15 text-primary" : "bg-secondary text-secondary-foreground"}`}>
              {g.singleAction ? "ACTION UNIQUE" : `${g.distinctActions} ACTIONS`}
            </span>
            {hasConversions && (
              <span className="px-2 py-0.5 rounded text-[10px] font-display font-bold bg-primary/15 text-primary border border-primary/30">
                CONVERSION RÉELLE · {g.conversions} conversion{(g.conversions ?? 0) > 1 ? "s" : ""}
              </span>
            )}
            <span className={`px-2 py-0.5 rounded border text-[10px] font-display font-bold ${IMPACT_CLS[impact.label]}`}>
              Impact potentiel {impact.label}
            </span>
          </div>
          <div className="font-display font-semibold text-foreground flex items-center gap-1">
            {open ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
            {g.title}
          </div>
          {o.url && <div className="text-xs font-mono text-muted-foreground truncate mt-0.5">{o.url}</div>}
          <div className="mt-2 grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
            <div className="rounded-md bg-secondary/40 p-2"><div className="text-muted-foreground">Pages</div><div className="font-display font-bold text-foreground">{g.kind === "page" ? 1 : (g.pages || "—")}</div></div>
            <div className="rounded-md bg-secondary/40 p-2"><div className="text-muted-foreground">Impressions</div><div className="font-display font-bold text-foreground">{fmtNum(g.impressions)}</div></div>
            <div className="rounded-md bg-secondary/40 p-2"><div className="text-muted-foreground">Clics</div><div className="font-display font-bold text-foreground">{fmtNum(g.clicks)}</div></div>
            <div className="rounded-md bg-secondary/40 p-2"><div className="text-muted-foreground">CTR</div><div className="font-display font-bold text-foreground">{fmtPct(g.ctr)}</div></div>
            <div className="rounded-md bg-secondary/40 p-2"><div className="text-muted-foreground">Position</div><div className="font-display font-bold text-foreground">{fmtPos(g.position)}</div></div>
            <div className="rounded-md bg-secondary/40 p-2"><div className="text-muted-foreground">Conversions</div><div className="font-display font-bold text-foreground">{fmtNum(g.conversions)}</div></div>
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            <span className="font-display font-bold text-foreground">Type :</span> {KIND_LABEL[g.kind]} · <span className="font-display font-bold text-foreground">Signal :</span> {TYPE_LABEL[o.type] ?? o.type.replace(/_/g, " ")} · {pageCountText}
          </div>
          <div className="text-sm text-foreground mt-1">
            <span className="font-display font-bold">Action : </span>{g.actionLabel}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            <span className="font-display font-bold text-foreground">Impact potentiel : </span>{impact.label} — {impact.reason}
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            <span className="font-display font-bold text-foreground">Pourquoi : </span>{g.reason ?? "—"}
          </div>
          <PriorityPagesPreview pages={priorityPages} limit={g.kind === "page" ? 1 : 5} />
          {g.relatedGroups.length > 0 && (
            <div className="text-xs text-muted-foreground mt-1 italic">
              Cette action fait partie d'un constat plus large : {g.relatedGroups.map((r) => r.title).join(" · ")}
            </div>
          )}
        </button>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <button onClick={() => onWork(g)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-display font-semibold hover:opacity-90">
            <Zap className="w-3.5 h-3.5" />
            {natureOfType(o.type) === "verification" ? verificationButtonLabel("idle") : workButtonLabel(o.status, capabilityOfGroup(g))}
          </button>
          {o.status === "dismissed" ? (
            <button onClick={() => void onStatus(o.id, "open")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <Check className="w-3 h-3" /> Réouvrir
            </button>
          ) : (
            <button onClick={() => onDismiss(o.id)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <X className="w-3 h-3" /> Ignorer
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 md:grid-cols-2 rounded-md border border-border bg-secondary/30 p-3 text-xs">
            <div className="space-y-2">
              <div>
                <div className="font-display font-bold text-foreground mb-1">Pourquoi cette action ?</div>
                <p className="text-muted-foreground">{o.reason ?? o.rationale}</p>
              </div>
              <div>
                <div className="font-display font-bold text-foreground mb-1">Action recommandée</div>
                <p className="text-muted-foreground">{o.recommended_action ?? "—"}</p>
              </div>
              {o.expected_impact && (
                <div>
                  <div className="font-display font-bold text-foreground mb-1">Impact attendu</div>
                  <p className="text-muted-foreground">{o.expected_impact}</p>
                </div>
              )}
              <div className="text-muted-foreground">
                <div><span className="text-foreground">Signal d'origine :</span> {g.signalTitle}</div>
                <div><span className="text-foreground">Territoire :</span> {g.city ?? "—"}</div>
                <div><span className="text-foreground">Service :</span> {g.service ?? "—"}</div>
                <div><span className="text-foreground">Source :</span> {o.source ?? "—"}</div>
              </div>
            </div>
            <div>
              <div className="font-display font-bold text-foreground mb-1">Pourquoi dans le top ? (score {g.score}/100)</div>
              <ul className="space-y-0.5">
                {(o.score_factors ?? []).map((f, i) => (
                  <li key={`${f.label}-${i}`} className="text-muted-foreground flex justify-between gap-2">
                    <span>{f.label}</span>
                    <span className={f.points >= 0 ? "text-primary font-semibold" : "text-destructive font-semibold"}>
                      {f.points > 0 ? "+" : ""}{f.points}
                    </span>
                  </li>
                ))}
                {(o.score_factors?.length ?? 0) === 0 && <li className="text-muted-foreground">—</li>}
              </ul>
              <div className="mt-1 pt-1 border-t border-border flex justify-between font-display font-bold text-foreground">
                <span>TOTAL</span><span>{o.score}/100</span>
              </div>
            </div>
          </div>

          {(g.kind !== "page" && priorityPages.length > 5) && <PriorityPagesList pages={priorityPages} limit={10} />}

          {g.members.length > 1 && (
            <div className="rounded-md border border-border p-3 text-xs space-y-1">
              <div className="font-display font-bold text-foreground">
                Signaux regroupés dans cette action ({g.members.length})
              </div>
              {g.members.map((m) => (
                <div key={m.id} className="text-muted-foreground">
                  <span className="text-foreground">{TYPE_LABEL[m.type] ?? m.type}</span> — {m.title} · score {m.score}
                  {m.recommended_action ? ` · ${m.recommended_action}` : ""}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export default function CopilotDashboard() {
  const { data, copilot, actionPageMetrics, loading, scanning, step, rescan, reload, setOpportunityStatus } = useCopilot();
  const [showDiag, setShowDiag] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [showAll, setShowAll] = useState(false);
  const [mode, setMode] = useState<"actions" | "all">("actions");
  const [workGroup, setWorkGroup] = useState<ActionGroup | null>(null);
  const [verifyGroup, setVerifyGroup] = useState<ActionGroup | null>(null);
  const [showCounters, setShowCounters] = useState(false);
  const [dismissId, setDismissId] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState("");

  if (loading && !data) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!data) return <p className="text-sm text-muted-foreground">Aucune donnée.</p>;

  const k = data.kpi;
  const run = copilot?.last_run ?? null;
  const opps = copilot?.opportunities ?? [];
  const counts = copilot?.counts ?? {};

  const filtered = opps.filter((o) => matchFilter(o, filter));
  const visible = showAll ? filtered : filtered.slice(0, 10);
  const actionGroups = buildActionGroups(filtered);
  const visibleGroups = showAll ? actionGroups : actionGroups.slice(0, 10);
  const grouped = actionGroups.filter((g) => g.members.length > 1).length;
  const ctr_ = buildCopilotCounters({
    signalsDetected: run?.signals_detected,
    openCount: Number(counts.open ?? 0),
    inProgressCount: Number(counts.in_progress ?? 0),
    completedCount: Number(counts.completed ?? 0),
    totalLoaded: opps.length,
    filteredCount: filtered.length,
    groups: actionGroups,
  });

  const onStatus: StatusSetter = async (id, s, extra) => {
    await setOpportunityStatus(id, s, extra);
    toast.success(
      s === "dismissed" ? "Opportunité ignorée"
        : s === "completed" ? "Opportunité marquée terminée"
        : s === "error" ? "Action en erreur — voir le détail"
        : s === "open" ? "Opportunité réouverte"
        : "Opportunité en cours",
    );
  };

  const openWork = async (g: ActionGroup) => {
    if (verificationKindOfType(g.primary.type)) { setVerifyGroup(g); return; }
    setWorkGroup(g);
    if (g.primary.status === "open") await setOpportunityStatus(g.primary.id, "in_progress");
  };
  const openWorkForOpportunity = (o: Opportunity) => {
    const [g] = buildActionGroups([o]);
    if (g) void openWork(g);
  };
  const confirmDismiss = async () => {
    if (!dismissId) return;
    await onStatus(dismissId, "dismissed", { reason: dismissReason.trim() || null });
    setDismissId(null);
    setDismissReason("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-display font-bold text-foreground">Copilote SEO</h2>
          <p className="text-sm text-muted-foreground">Priorités calculées à partir de Search Console, des conversions, de l'indexation et de la couverture réelle. Analyse en lecture seule : aucune page n'est modifiée ni publiée.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={reload}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm font-display font-semibold hover:bg-secondary">
            <RefreshCw className="w-4 h-4" /> Rafraîchir
          </button>
          <button onClick={rescan} disabled={scanning}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-semibold hover:opacity-90 disabled:opacity-60">
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Lancer l'analyse IA
          </button>
        </div>
      </div>

      {/* Progression de l'analyse */}
      {step >= 0 && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-1.5">
          {SCAN_STEPS.map((s, i) => (
            <div key={s} className={`flex items-center gap-2 text-sm ${i < step ? "text-muted-foreground" : i === step ? "text-foreground font-semibold" : "text-muted-foreground/50"}`}>
              {i < step ? <Check className="w-4 h-4 text-primary" /> : i === step ? <Loader2 className="w-4 h-4 animate-spin" /> : <span className="w-4" />}
              {s}
            </div>
          ))}
        </div>
      )}

      {/* KPI */}
      <div>
        <h3 className="text-xs uppercase tracking-wider font-display font-bold text-muted-foreground mb-2">Trafic & couverture (28 j)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Pages publiées" value={`${k.pages_published}/${k.pages_total}`} icon={FileText} hint={`${k.pages_indexed} indexées`} />
          <KpiCard label="Clics Google" value={k.gsc_clicks_28d.toLocaleString()} icon={TrendingUp} hint={`${k.gsc_impressions_28d.toLocaleString()} impressions`} />
          <KpiCard label="Position moyenne" value={k.gsc_position_avg.toFixed(1)} icon={TrendingUp} />
          <KpiCard label="QA moyen" value={`${k.qa_avg}/100`} icon={Zap} />
        </div>
      </div>

      <div>
        <h3 className="text-xs uppercase tracking-wider font-display font-bold text-muted-foreground mb-2">Conversions (30 j)</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard label="Total conversions" value={k.conversions_30d} icon={Zap} />
          <KpiCard label="Demandes" value={k.submissions_30d} icon={FileText} />
          <KpiCard label="Téléphone" value={k.phone_30d} icon={Phone} />
          <KpiCard label="WhatsApp" value={k.whatsapp_30d} icon={MessageCircle} />
          <KpiCard label="Courriel" value={k.email_30d} icon={Mail} />
        </div>
      </div>

      {/* Opportunités */}
      <div>
        <h3 className="text-xs uppercase tracking-wider font-display font-bold text-muted-foreground mb-2">Opportunités SEO</h3>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-3">
          <KpiCard label="Opportunités" value={counts.open ?? opps.length} icon={Sparkles} />
          <KpiCard label="Critiques" value={counts.critical ?? 0} icon={Zap} />
          <KpiCard label="Hautes" value={counts.high ?? 0} icon={Zap} />
          <KpiCard label="Moyennes" value={counts.medium ?? 0} icon={Zap} />
          <KpiCard label="Avec conversion" value={counts.with_conversions ?? 0} icon={Phone} />
          <KpiCard label="Fort potentiel" value={counts.high_potential ?? 0} icon={TrendingUp} hint="Score ≥ 60" />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <div className="inline-flex rounded-md border border-border overflow-hidden mr-2">
            <button onClick={() => { setMode("actions"); setShowAll(false); }}
              className={`px-3 py-1 text-xs font-display font-semibold ${mode === "actions" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}>
              Actions uniques ({actionGroups.length})
            </button>
            <button onClick={() => { setMode("all"); setShowAll(false); }}
              className={`px-3 py-1 text-xs font-display font-semibold ${mode === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}>
              Toutes les opportunités ({filtered.length})
            </button>
          </div>
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => { setFilter(f.key); setShowAll(false); }}
              className={`px-2.5 py-1 rounded-md text-xs font-display font-semibold border ${filter === f.key ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}>
              {f.label} ({opps.filter((o) => matchFilter(o, f.key)).length})
            </button>
          ))}
        </div>

        <div className="mb-3 rounded-lg border border-border bg-card p-3" data-testid="copilot-counters">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
            <div className="rounded-md bg-secondary/40 p-2"><div className="text-muted-foreground">Signaux détectés</div><div className="font-display font-bold text-foreground">{ctr_.signals}</div></div>
            <div className="rounded-md bg-secondary/40 p-2"><div className="text-muted-foreground">Opportunités ouvertes</div><div className="font-display font-bold text-foreground">{ctr_.opportunitiesOpen}</div></div>
            <div className="rounded-md bg-secondary/40 p-2"><div className="text-muted-foreground">Affichées ici</div><div className="font-display font-bold text-foreground">{ctr_.opportunitiesVisible}</div></div>
            <div className="rounded-md bg-secondary/40 p-2"><div className="text-muted-foreground">Actions exécutables</div><div className="font-display font-bold text-foreground">{ctr_.executable}</div></div>
            <div className="rounded-md bg-secondary/40 p-2"><div className="text-muted-foreground">Vérifications</div><div className="font-display font-bold text-foreground">{ctr_.verifications}</div></div>
            <div className="rounded-md bg-secondary/40 p-2"><div className="text-muted-foreground">Terminées</div><div className="font-display font-bold text-foreground">{ctr_.actionsCompleted}</div></div>
          </div>
          <button onClick={() => setShowCounters((v) => !v)} className="mt-2 text-xs font-display font-semibold text-primary">
            {showCounters ? "Masquer le détail des compteurs" : "Comprendre les compteurs"}
          </button>
          {showCounters && (
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground list-disc pl-4" data-testid="counters-explanation">
              {countersExplanation(ctr_).map((line) => <li key={line}>{line}</li>)}
            </ul>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center space-y-2">
            <Sparkles className="w-6 h-6 text-muted-foreground mx-auto" />
            <p className="text-sm text-foreground font-display font-semibold">
              {run ? "Analyse terminée — aucune opportunité répondant actuellement aux critères de priorité." : "Aucune analyse n'a encore été lancée."}
            </p>
            {run && (
              <p className="text-xs text-muted-foreground">
                {run.pages_analyzed} pages analysées · {run.gsc_rows_analyzed} URL Search Console · {run.impressions_analyzed.toLocaleString("fr-CA")} impressions ·
                {" "}{run.conversions_analyzed} conversions · {run.indexed_analyzed} pages indexées · {run.rules?.length ?? 0} règles évaluées ·
                {" "}{run.signals_detected ?? 0} signaux détectés, {run.signals_rejected ?? 0} écartés faute de données suffisantes
              </p>
            )}
          </div>
        ) : (
          <>
            {mode === "actions" && (
              <p className="text-xs text-muted-foreground mb-2">
                {actionGroups.length} action(s) distincte(s) à partir de {filtered.length} opportunité(s) — {grouped} action(s) regroupent plusieurs signaux. Aucune opportunité n'est supprimée : tout reste visible dans « Toutes les opportunités ».
              </p>
            )}
            <ul className="rounded-lg border border-border bg-card divide-y divide-border">
              {mode === "actions"
                ? visibleGroups.map((g, i) => <ActionGroupCard key={g.key} g={g} rank={i + 1} priorityPages={buildPriorityPagesForAction(g, actionPageMetrics, g.kind === "page" ? 1 : 10)} onStatus={onStatus} onWork={openWork} onDismiss={setDismissId} />)
                : visible.map((o, i) => <OpportunityRow key={o.id} o={o} rank={i + 1} onStatus={onStatus} onWork={openWorkForOpportunity} onDismiss={setDismissId} />)}
            </ul>
            {(mode === "actions" ? actionGroups.length > visibleGroups.length : filtered.length > visible.length) && (
              <button onClick={() => setShowAll(true)}
                className="mt-2 w-full rounded-md border border-border py-2 text-sm font-display font-semibold hover:bg-secondary">
                {mode === "actions" ? `Voir toutes les actions (${actionGroups.length})` : `Voir toutes les opportunités (${filtered.length})`}
              </button>
            )}
            {showAll && (mode === "actions" ? actionGroups.length : filtered.length) > 10 && (
              <button onClick={() => setShowAll(false)}
                className="mt-2 w-full rounded-md border border-border py-2 text-sm font-display font-semibold hover:bg-secondary">
                Afficher seulement le top 10
              </button>
            )}
          </>
        )}
      </div>

      {/* Diagnostic */}
      {run && (
        <div className="rounded-lg border border-border bg-card">
          <button onClick={() => setShowDiag((v) => !v)} className="w-full flex items-center justify-between p-3 text-left">
            <span className="flex items-center gap-2 text-sm font-display font-bold text-foreground">
              <CircleHelp className="w-4 h-4" /> Pourquoi ces opportunités ? (diagnostic des règles)
            </span>
            {showDiag ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          {showDiag && (
            <div className="border-t border-border p-3 space-y-2 text-xs">
              <div className="text-muted-foreground">
                Analyse du {new Date(run.started_at).toLocaleString("fr-CA")} · durée {((run.duration_ms ?? 0) / 1000).toFixed(1)} s ·
                {" "}{run.pages_analyzed} pages · {run.gsc_rows_analyzed} URL Search Console · {run.conversions_analyzed} conversions ·
                {" "}{run.new_count} nouvelle(s), {run.updated_count} mise(s) à jour, {run.stale_count} obsolète(s)
              </div>
              <table className="w-full">
                <thead className="text-muted-foreground">
                  <tr><th className="text-left py-1">Règle</th><th className="text-right">Candidates</th><th className="text-right">Retenues</th><th className="text-left pl-3">Critère</th></tr>
                </thead>
                <tbody>
                  {(run.rules ?? []).map((r) => (
                    <tr key={r.code} className="border-t border-border/60">
                      <td className="py-1 text-foreground">{r.label}</td>
                      <td className="text-right">{r.candidates}</td>
                      <td className="text-right font-display font-bold text-foreground">{r.retained}</td>
                      <td className="pl-3 text-muted-foreground">{r.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Historique */}
      {copilot?.history?.length ? (
        <div className="rounded-lg border border-border bg-card">
          <button onClick={() => setShowHistory((v) => !v)} className="w-full flex items-center justify-between p-3 text-left">
            <span className="flex items-center gap-2 text-sm font-display font-bold text-foreground">
              <History className="w-4 h-4" /> Historique des analyses
            </span>
            {showHistory ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          {showHistory && (
            <div className="border-t border-border p-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="text-left py-1">Date</th><th className="text-right">Durée</th><th className="text-right">Pages</th>
                    <th className="text-right">Search Console</th><th className="text-right">Conversions</th>
                    <th className="text-right">Détectées</th><th className="text-right">Nouvelles</th><th className="text-right">MAJ</th>
                    <th className="text-right">Résolues</th><th className="text-right">Obsolètes</th><th className="text-left pl-3">Comparaison</th>
                  </tr>
                </thead>
                <tbody>
                  {copilot.history.map((h) => (
                    <tr key={h.id} className="border-t border-border/60">
                      <td className="py-1 text-foreground">{new Date(h.started_at).toLocaleString("fr-CA")}</td>
                      <td className="text-right">{((h.duration_ms ?? 0) / 1000).toFixed(1)} s</td>
                      <td className="text-right">{h.pages_analyzed}</td>
                      <td className="text-right">{h.gsc_rows_analyzed}</td>
                      <td className="text-right">{h.conversions_analyzed}</td>
                      <td className="text-right">{h.opportunities_detected}</td>
                      <td className="text-right">{h.new_count}</td>
                      <td className="text-right">{h.updated_count}</td>
                      <td className="text-right">{h.resolved_count ?? 0}</td>
                      <td className="text-right">{h.stale_count}</td>
                      <td className="pl-3 text-muted-foreground">
                        {h.comparison
                          ? `${h.comparison.nouvelles} nouvelle(s), ${h.comparison.resolues} résolue(s), ${h.comparison.toujours_ouvertes} toujours ouverte(s), ${h.comparison.aggravees} aggravée(s)`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      <OpportunityWorkPanel
        group={workGroup}
        priorityPages={workGroup ? buildPriorityPagesForAction(workGroup, actionPageMetrics, workGroup.kind === "page" ? 1 : 50) : []}
        open={workGroup !== null}
        onClose={() => { setWorkGroup(null); void reload(); }}
        onStatus={async (id, status, extra) => { await setOpportunityStatus(id, status, extra); }}
      />

      <VerificationPanel
        group={verifyGroup}
        kind={verifyGroup ? verificationKindOfType(verifyGroup.primary.type) as VerificationKind | null : null}
        priorityPages={verifyGroup ? buildPriorityPagesForAction(verifyGroup, actionPageMetrics, verifyGroup.kind === "page" ? 1 : 50) : []}
        open={verifyGroup !== null}
        onClose={() => { setVerifyGroup(null); void reload(); }}
      />

      {dismissId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
          <div className="w-full max-w-sm rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="font-display font-bold text-foreground">Voulez-vous ignorer cette opportunité ?</div>
            <p className="text-xs text-muted-foreground">Elle reste conservée dans l'historique et dans « Toutes les opportunités ».</p>
            <input value={dismissReason} onChange={(e) => setDismissReason(e.target.value)} placeholder="Raison (facultatif)"
              className="w-full rounded border border-border bg-background p-2 text-xs" />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setDismissId(null); setDismissReason(""); }} className="px-3 py-1.5 rounded-md border border-border text-xs">Annuler</button>
              <button onClick={() => void confirmDismiss()} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-display font-semibold">Ignorer</button>
            </div>
          </div>
        </div>
      )}

      {/* Gains & pertes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DeltaList title="Top gains (28 j)" icon={TrendingUp} tone="positive" rows={data.top_gains_30d} />
        <DeltaList title="Top pertes (28 j)" icon={TrendingDown} tone="negative" rows={data.top_losses_30d} />
      </div>
    </div>
  );
}

function DeltaList({ title, icon: Icon, tone, rows }: { title: string; icon: React.ComponentType<{ className?: string }>; tone: "positive" | "negative"; rows: Array<{ slug: string; title: string; clicks: number; clicks_delta: number; position: number; position_gain: number }> }) {
  const color = tone === "positive" ? "text-primary" : "text-destructive";
  return (
    <div>
      <h3 className="text-xs uppercase tracking-wider font-display font-bold text-muted-foreground mb-2 flex items-center gap-1.5">
        <Icon className={`w-3.5 h-3.5 ${color}`} /> {title}
      </h3>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Aucune variation.</div>
      ) : (
        <ul className="rounded-lg border border-border bg-card divide-y divide-border">
          {rows.slice(0, 5).map((r) => (
            <li key={r.slug} className="p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-body text-foreground text-sm truncate">{r.title}</div>
                <div className="text-xs text-muted-foreground font-mono truncate">/{r.slug}</div>
              </div>
              <div className="flex items-center gap-3 shrink-0 text-xs">
                <span className={`font-display font-bold ${color}`}>
                  {r.clicks_delta > 0 ? "+" : ""}{r.clicks_delta} clics
                </span>
                <Link to={`/${r.slug}`} target="_blank" className="text-primary hover:underline inline-flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
