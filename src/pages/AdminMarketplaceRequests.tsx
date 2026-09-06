// ============================================================
// CENTRE ADMINISTRATIF — GESTION DES SOUMISSIONS
// Indicateurs, files de travail, fiche complète d'un projet
// (client, invitations, soumissions, attribution, revenus,
// messages, notes internes, journal d'activité).
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Pin, RefreshCw, Trash2 } from "lucide-react";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import FullPageState from "@/components/FullPageState";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import Messagerie from "@/components/marketplace/Messagerie";
import {
  WORK_QUEUES, addAdminNote, deleteAdminNote, fetchActivityLog, fetchAdminBoard,
  fetchAdminNotes, fetchClientDocuments, fetchInvitations, fetchLots, fetchRequest,
  fetchRequestBids, queueOf, setRequestStatus,
} from "@/lib/marketplace/api";
import type { ActivityEntry, AdminNote, BoardRow, LotBid, WorkQueue } from "@/lib/marketplace/api";
import { REQUEST_STATUSES } from "@/lib/marketplace/types";
import type { Invitation, QuoteRequest, RequestLot } from "@/lib/marketplace/types";

const argent = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(Number(v));

const date = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" }) : "—";

const statutLabel = (v: string | null | undefined) =>
  REQUEST_STATUSES.find((s) => s.value === v)?.label ?? v ?? "—";

const ENTITES: Record<string, string> = {
  mkt_quote_requests: "Demande",
  mkt_invitations: "Invitation",
  mkt_bids: "Soumission",
  mkt_awards: "Attribution",
};

function Kpi({ titre, valeur, ton }: { titre: string; valeur: string; ton?: "vert" | "ambre" }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{titre}</p>
      <p className={`mt-1 text-2xl font-bold ${ton === "vert" ? "text-primary" : ton === "ambre" ? "text-amber-500" : ""}`}>
        {valeur}
      </p>
    </Card>
  );
}

export default function AdminMarketplaceRequests() {
  const { isReady, isAuthenticated } = useAuthReady();
  const { isAdmin, loading: roleLoading } = useUserRoles();
  const { toast } = useToast();

  const [rows, setRows] = useState<BoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState<WorkQueue | "toutes">("toutes");
  const [selected, setSelected] = useState<string | null>(null);

  const [request, setRequest] = useState<QuoteRequest | null>(null);
  const [lots, setLots] = useState<RequestLot[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [bids, setBids] = useState<LotBid[]>([]);
  const [documents, setDocuments] = useState<Record<string, unknown>[]>([]);
  const [notes, setNotes] = useState<AdminNote[]>([]);
  const [journal, setJournal] = useState<ActivityEntry[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [nouvelleNote, setNouvelleNote] = useState("");

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchAdminBoard());
    } catch (e) {
      toast({ title: "Chargement impossible", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { if (isAdmin) void charger(); }, [isAdmin, charger]);

  const chargerDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const [r, l, inv, b, docs, n, j] = await Promise.all([
        fetchRequest(id), fetchLots(id), fetchInvitations({ requestId: id }),
        fetchRequestBids(id), fetchClientDocuments([id]), fetchAdminNotes(id), fetchActivityLog(id),
      ]);
      setRequest(r); setLots(l); setInvitations(inv as Invitation[]);
      setBids(b); setDocuments(docs as Record<string, unknown>[]); setNotes(n); setJournal(j);
    } catch (e) {
      toast({ title: "Fiche indisponible", description: (e as Error).message, variant: "destructive" });
    } finally {
      setDetailLoading(false);
    }
  }, [toast]);

  useEffect(() => { if (selected) void chargerDetail(selected); }, [selected, chargerDetail]);

  const parFile = useMemo(() => {
    const map = new Map<WorkQueue, BoardRow[]>();
    rows.forEach((r) => {
      const q = queueOf(r);
      map.set(q, [...(map.get(q) ?? []), r]);
    });
    return map;
  }, [rows]);

  const visibles = queue === "toutes" ? rows : (parFile.get(queue) ?? []);

  const kpi = useMemo(() => {
    const somme = (f: (r: BoardRow) => number | null | undefined) =>
      rows.reduce((t, r) => t + (Number(f(r)) || 0), 0);
    return {
      nouvelles: (parFile.get("nouvelles") ?? []).length,
      aQualifier: (parFile.get("a_qualifier") ?? []).length,
      distribuees: rows.filter((r) => r.invitations_count > 0).length,
      soumissions: somme((r) => r.bids_count),
      enAttente: (parFile.get("attribution") ?? []).length,
      attribues: rows.filter((r) => r.award_status).length,
      valeur: somme((r) => r.award_amount ?? r.estimated_value),
      revenus: somme((r) => r.commission_amount),
      aFacturer: rows.filter((r) => r.commission_status === "a_facturer").length,
    };
  }, [rows, parFile]);

  const ajouterNote = async (pinned = false) => {
    if (!selected || !nouvelleNote.trim()) return;
    try {
      await addAdminNote(selected, nouvelleNote.trim(), pinned);
      setNouvelleNote("");
      setNotes(await fetchAdminNotes(selected));
    } catch (e) {
      toast({ title: "Note non enregistrée", description: (e as Error).message, variant: "destructive" });
    }
  };

  const changerStatut = async (statut: string) => {
    if (!selected) return;
    try {
      await setRequestStatus(selected, statut);
      toast({ title: "Statut mis à jour" });
      await Promise.all([charger(), chargerDetail(selected)]);
    } catch (e) {
      toast({ title: "Changement refusé", description: (e as Error).message, variant: "destructive" });
    }
  };

  if (!isReady || roleLoading) return <FullPageState title="Chargement" message="Vérification de votre accès…" showSpinner />;
  if (!isAuthenticated) return <FullPageState title="Connexion requise" message="Connectez-vous pour accéder à la gestion des soumissions." />;
  if (!isAdmin) return <FullPageState title="Accès réservé" message="Cette section est réservée à l'administration de Vrac Québec." />;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link to="/admin" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Retour à l'administration
            </Link>
            <h1 className="text-2xl font-bold md:text-3xl">Gestion des soumissions</h1>
            <p className="text-sm text-muted-foreground">Files de travail, suivi des projets et revenus de la place de marché.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild><Link to="/admin/marche/jumelage">Jumelage</Link></Button>
            <Button variant="outline" asChild><Link to="/admin/marche/lots">Lots</Link></Button>
            <Button variant="outline" asChild><Link to="/admin/marche/commissions">Revenus</Link></Button>
            <Button variant="outline" asChild><Link to="/admin/marche/transactions">Matériaux et transport</Link></Button>
            <Button variant="outline" asChild><Link to="/admin/marche/analytique">Analytique</Link></Button>
            <Button variant="outline" asChild><Link to="/admin/marche/automatisations">Automatisations</Link></Button>
            <Button variant="outline" asChild><Link to="/admin/marche/scores">Scores partenaires</Link></Button>
            <Button variant="outline" onClick={() => void charger()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <Kpi titre="Nouvelles demandes" valeur={String(kpi.nouvelles)} ton="vert" />
          <Kpi titre="À qualifier" valeur={String(kpi.aQualifier)} />
          <Kpi titre="Demandes distribuées" valeur={String(kpi.distribuees)} />
          <Kpi titre="Soumissions reçues" valeur={String(kpi.soumissions)} />
          <Kpi titre="Attribution à confirmer" valeur={String(kpi.enAttente)} ton="ambre" />
          <Kpi titre="Projets attribués" valeur={String(kpi.attribues)} />
          <Kpi titre="Valeur des projets" valeur={argent(kpi.valeur)} />
          <Kpi titre="Revenus potentiels" valeur={argent(kpi.revenus)} ton="vert" />
          <Kpi titre="Commissions à facturer" valeur={String(kpi.aFacturer)} ton="ambre" />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={queue === "toutes" ? "default" : "outline"} onClick={() => setQueue("toutes")}>
            Toutes ({rows.length})
          </Button>
          {WORK_QUEUES.map((q) => (
            <Button key={q.key} size="sm" variant={queue === q.key ? "default" : "outline"} onClick={() => setQueue(q.key)}>
              {q.label} ({(parFile.get(q.key) ?? []).length})
            </Button>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <Card className="overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Chargement des demandes…
              </div>
            ) : visibles.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">Aucune demande dans cette file.</p>
            ) : (
              <ul className="divide-y">
                {visibles.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(r.id)}
                      className={`w-full px-4 py-3 text-left transition hover:bg-muted/60 ${selected === r.id ? "bg-muted" : ""}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">{r.request_number ?? "—"} · {r.title ?? "Sans titre"}</span>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{statutLabel(r.status)}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {[r.city, r.client_type, `${r.invitations_count} invitation(s)`, `${r.bids_count} soumission(s)`]
                          .filter(Boolean).join(" · ")}
                      </p>
                      <p className="text-xs text-muted-foreground">Reçue le {date(r.created_at)}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="space-y-4">
            {!selected ? (
              <Card className="p-8 text-center text-sm text-muted-foreground">
                Sélectionnez une demande pour voir sa fiche complète.
              </Card>
            ) : detailLoading ? (
              <Card className="p-8 text-center text-sm text-muted-foreground">
                <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Chargement de la fiche…
              </Card>
            ) : request ? (
              <>
                <Card className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-bold">{request.request_number} · {request.title}</h2>
                      <p className="text-sm text-muted-foreground">
                        {[request.address, request.city, request.region].filter(Boolean).join(", ") || "Lieu non précisé"}
                      </p>
                    </div>
                    <select
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                      value={request.status}
                      onChange={(e) => void changerStatut(e.target.value)}
                    >
                      {REQUEST_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <p><span className="text-muted-foreground">Client :</span> {request.contact_name || "—"} {request.organization_name ? `(${request.organization_name})` : ""}</p>
                    <p><span className="text-muted-foreground">Coordonnées :</span> {[request.contact_phone, request.contact_email].filter(Boolean).join(" · ") || "—"}</p>
                    <p><span className="text-muted-foreground">Date souhaitée :</span> {request.desired_date ?? "—"}</p>
                    <p><span className="text-muted-foreground">Valeur estimée :</span> {argent(request.estimated_value)}</p>
                  </div>
                  {request.description && <p className="whitespace-pre-wrap text-sm">{request.description}</p>}
                  {lots.length > 0 && (
                    <p className="text-sm text-muted-foreground">{lots.length} lot(s) : {lots.map((l) => `${l.lot_number} ${l.title}`).join(" · ")}</p>
                  )}
                </Card>

                <Card className="p-4">
                  <h3 className="mb-2 font-semibold">Entreprises invitées ({invitations.length})</h3>
                  {invitations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Aucune invitation. <Link className="underline" to="/admin/marche/jumelage">Lancer le jumelage</Link>.
                    </p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {invitations.map((i) => (
                        <li key={i.id} className="flex flex-wrap justify-between gap-2">
                          <span>{i.company_id?.slice(0, 8)} · score {i.match_score ?? "—"}</span>
                          <span className="text-muted-foreground">
                            {i.status} · envoyée {date(i.sent_at)} {i.responded_at ? `· répondu ${date(i.responded_at)}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card className="p-4">
                  <h3 className="mb-2 font-semibold">Soumissions reçues ({bids.length})</h3>
                  {bids.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucune soumission pour l'instant.</p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {bids.map((b) => (
                        <li key={b.id} className="flex flex-wrap justify-between gap-2">
                          <span>{b.partner_name}</span>
                          <span>{argent(b.amount)} · {b.status} · {date(b.submitted_at)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card className="p-4">
                  <h3 className="mb-2 font-semibold">Documents ({documents.length})</h3>
                  {documents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucun document joint.</p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {documents.map((d) => (
                        <li key={String(d.id)}>{String(d.title ?? d.file_name ?? "Document")}</li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card className="p-4">
                  <h3 className="mb-2 font-semibold">Notes internes</h3>
                  <p className="mb-2 text-xs text-muted-foreground">Invisibles au client et aux entreprises partenaires.</p>
                  <Textarea
                    value={nouvelleNote}
                    onChange={(e) => setNouvelleNote(e.target.value)}
                    placeholder="Ajouter une note interne…"
                    rows={2}
                  />
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => void ajouterNote(false)} disabled={!nouvelleNote.trim()}>Ajouter</Button>
                    <Button size="sm" variant="outline" onClick={() => void ajouterNote(true)} disabled={!nouvelleNote.trim()}>
                      <Pin className="mr-1 h-3.5 w-3.5" /> Épingler
                    </Button>
                  </div>
                  <ul className="mt-3 space-y-2 text-sm">
                    {notes.map((n) => (
                      <li key={n.id} className="rounded-md border p-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="whitespace-pre-wrap">{n.pinned ? "📌 " : ""}{n.body}</p>
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={async () => { await deleteAdminNote(n.id); setNotes(await fetchAdminNotes(selected)); }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{date(n.created_at)}</p>
                      </li>
                    ))}
                  </ul>
                </Card>

                <Card className="p-4">
                  <Messagerie requestId={selected} party="vrac_quebec" titre="Messages du projet" />
                </Card>

                <Card className="p-4">
                  <h3 className="mb-2 font-semibold">Journal d'activité</h3>
                  {journal.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucune activité enregistrée.</p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {journal.map((e) => (
                        <li key={e.id} className="flex flex-wrap justify-between gap-2">
                          <span>
                            {ENTITES[e.entity] ?? e.entity} — {e.action}
                            {e.detail?.apres ? ` : ${String(e.detail.avant ?? "—")} → ${String(e.detail.apres)}` : ""}
                          </span>
                          <span className="text-muted-foreground">{date(e.created_at)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
