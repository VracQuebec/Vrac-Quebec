// ============================================================
// LOT 12 — QUALIFICATION DES DEMANDES DE REMBLAI (INTERNE / ADMIN)
// ------------------------------------------------------------
// LECTURE SEULE : aucune écriture, aucune confirmation enregistrée,
// aucun statut CRM, aucune disponibilité, aucune communication.
// Protégé par le drapeau material_qualification_v2 (inactif par défaut).
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, ListChecks, TriangleAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { isFeatureEnabled } from "@/lib/flags";
import {
  buildQualificationProposal, prioritizeQueue, relevantMaterialKeys,
  type QualificationProposal,
} from "@/lib/qualification/lot12";

interface Row {
  id: string;
  dompe_number: string | null;
  city: string | null;
  status: string | null;
  availability_status: string | null;
  description: string | null;
  other_material: string | null;
  materials: string[] | null;
}

interface Entry { row: Row; proposal: QualificationProposal; priority: number; reasons: string[] }

const textOf = (r: Row) =>
  [r.description, r.other_material, (r.materials ?? []).join(", ")].filter(Boolean).join(". ");

function Card({ e }: { e: Entry }) {
  const p = e.proposal;
  return (
    <div className="rounded-lg border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{e.row.dompe_number ?? e.row.id.slice(0, 8)}</span>
        {e.row.city && <span className="text-muted-foreground">{e.row.city}</span>}
        <Badge variant={p.confidence === "high" ? "default" : p.confidence === "medium" ? "secondary" : "outline"}>
          {p.confidence === "high" ? "Confiance élevée" : p.confidence === "medium" ? "À vérifier" : "Ambigu"}
        </Badge>
        <span className="ml-auto font-mono text-xs text-muted-foreground">priorité {e.priority}</span>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">Texte original (jamais modifié) : « {p.originalText || "—"} »</p>

      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Matériaux détectés</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {p.detected.length === 0 && <span className="text-xs text-muted-foreground">Aucun.</span>}
            {p.detected.map((d, i) => (
              <Badge key={i} variant={d.status === "REFUSED" ? "destructive" : "default"} className="text-[10px]">
                {d.label}{d.status === "REFUSED" ? " (refusé)" : ""}
              </Badge>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground">À confirmer</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {p.toConfirm.length === 0 && <span className="text-xs text-muted-foreground">Aucun.</span>}
            {p.toConfirm.map((d, i) => <Badge key={i} variant="outline" className="text-[10px]">{d.label}</Badge>)}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Restrictions</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {p.refusals.length === 0 && <span className="text-xs text-muted-foreground">Aucune.</span>}
            {p.refusals.map((r, i) => (
              <Badge key={i} variant={r.certain ? "destructive" : "outline"} className="text-[10px]">
                {r.label}{r.certain ? "" : " — à confirmer"}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Portée : {p.scope === "broad" ? "acceptation large déclarée" : p.scope === "explicit" ? "matériaux nommés" : "inconnue"}
        {" · "}Calibres : {p.granulometries.length ? p.granulometries.map((g) => g.label).join(", ") : "non précisés"}
        {" · "}Conditions : {p.conditions.length ? p.conditions.join(", ") : "aucune"}
        {" · "}Environnement : inconnu (aucune déduction)
      </p>

      {p.ambiguityReasons.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
          {p.ambiguityReasons.map((x, i) => <li key={i}>? {x}</li>)}
        </ul>
      )}

      <p className="mt-1 text-[10px] text-muted-foreground">
        {e.reasons.join(" · ")} · {relevantMaterialKeys(p).length} matériau(x) pertinent(s) affiché(s)
      </p>

      <Button size="sm" variant="outline" className="mt-2" disabled>
        Confirmer ce groupe (désactivé — lecture seule)
      </Button>
    </div>
  );
}

export default function AdminMaterialQualification() {
  const { isReady } = useAuthReady();
  const { isAdmin, loading: rolesLoading } = useUserRoles();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const flagOn = isFeatureEnabled("material_qualification_v2");

  useEffect(() => {
    if (!isReady || !isAdmin) return;
    setLoading(true);
    supabase
      .from("submissions")
      .select("id,dompe_number,city,status,availability_status,description,other_material,materials")
      .eq("request_type", "remblai")
      .order("created_at", { ascending: false })
      .limit(300)
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        setRows((data ?? []) as Row[]);
        setLoading(false);
      });
  }, [isReady, isAdmin]);

  const entries: Entry[] = useMemo(() => {
    if (!rows) return [];
    const proposals = rows.map((row) => ({
      row,
      proposal: buildQualificationProposal({ submissionId: row.id, text: textOf(row) }),
    }));
    const scored = prioritizeQueue(
      proposals.map(({ row, proposal }) => ({
        submissionId: row.id,
        usable: row.status !== "perdu" && row.status !== "archivé",
        available: row.availability_status === "available",
        acceptedCount: proposal.detected.length,
        unknownCount: proposal.toConfirm.length + proposal.ambiguityReasons.length,
        potentialMatches: 0,
        lastConfirmationDays: null,
        missingFields: proposal.scope === "unknown" ? 2 : 0,
      })),
    );
    const byId = new Map(scored.map((s) => [s.submissionId, s]));
    return proposals
      .map(({ row, proposal }) => ({
        row, proposal,
        priority: byId.get(row.id)?.priority ?? 0,
        reasons: byId.get(row.id)?.reasons ?? [],
      }))
      .sort((a, b) => b.priority - a.priority);
  }, [rows]);

  const fast = entries.filter((e) => e.proposal.confidence === "high");
  const ambiguous = entries.filter((e) => e.proposal.confidence !== "high");
  const noMaterial = entries.filter((e) => relevantMaterialKeys(e.proposal).length === 0);

  if (!isReady || rolesLoading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!isAdmin) {
    return <div className="flex min-h-screen items-center justify-center p-6 text-center"><p className="text-muted-foreground">Accès réservé à l'administration.</p></div>;
  }

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <Link to="/admin" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Administration
      </Link>

      <h1 className="mt-3 flex items-center gap-2 font-display text-2xl font-bold">
        <ListChecks className="h-6 w-6" /> Qualification des demandes de remblai
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Interne et en lecture seule. Aucune donnée historique n'est modifiée, aucune confirmation n'est enregistrée.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/20 p-3 text-xs">
        <TriangleAlert className="h-4 w-4 text-muted-foreground" />
        Qualification publique : <Badge variant={flagOn ? "secondary" : "outline"}>{flagOn ? "aperçu activé (local)" : "désactivée"}</Badge>
        <span className="text-muted-foreground">· {entries.length} demande(s) analysée(s)</span>
      </div>

      {loading && <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>}

      <Tabs defaultValue="fast" className="mt-4">
        <TabsList className="flex w-full flex-wrap">
          <TabsTrigger value="fast">Confirmations rapides ({fast.length})</TabsTrigger>
          <TabsTrigger value="ambiguous">Cas ambigus ({ambiguous.length})</TabsTrigger>
          <TabsTrigger value="empty">Sans matériau exploitable ({noMaterial.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="fast" className="mt-3 space-y-3">
          {fast.slice(0, 50).map((e) => <Card key={e.row.id} e={e} />)}
        </TabsContent>
        <TabsContent value="ambiguous" className="mt-3 space-y-3">
          {ambiguous.slice(0, 50).map((e) => <Card key={e.row.id} e={e} />)}
        </TabsContent>
        <TabsContent value="empty" className="mt-3 space-y-3">
          {noMaterial.slice(0, 50).map((e) => <Card key={e.row.id} e={e} />)}
        </TabsContent>
      </Tabs>
    </div>
  );
}
