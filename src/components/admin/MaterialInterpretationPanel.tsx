// Comparateur administrateur : ANCIENNE interprétation (production) vs NOUVELLE (canonique, parallèle).
// Lecture seule. Aucun basculement : la production continue d'utiliser submissions.materials.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface Row {
  material_id: string;
  stance: string;
  original_value: string | null;
  granulometry_id: string | null;
  material_catalog: { name_fr: string; family: string } | null;
  material_granulometries: { label_fr: string } | null;
}

interface FillProfile {
  acceptance_scope: string;
  capacity_kind: string;
  capacity_value: number | null;
  capacity_unit: string | null;
  environment_status: string;
  accepted_truck_codes: string[] | null;
  heavy_truck_access: string | null;
  confirmed_at: string | null;
}

const SCOPE_LABEL: Record<string, string> = {
  explicit: "Matériaux nommés explicitement",
  broad: "Acceptation large déclarée (non confirmée matériau par matériau)",
  unknown: "Acceptation inconnue",
};

const CAPACITY_LABEL: Record<string, string> = {
  known: "Capacité connue", approximate: "Capacité approximative",
  unlimited: "Non précisée / illimitée", unknown: "Capacité inconnue",
};

export default function MaterialInterpretationPanel({
  submissionId, historicalMaterials, otherMaterial,
}: { submissionId: string; historicalMaterials: string[] | null; otherMaterial?: string | null }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [conditions, setConditions] = useState<{ condition_key: string; stance: string; original_text: string | null }[]>([]);
  const [pending, setPending] = useState<{ original_text: string; source_field: string; reason: string | null }[]>([]);
  const [profile, setProfile] = useState<FillProfile | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [rel, cond, rev, prof] = await Promise.all([
        supabase.from("submission_accepted_materials")
          .select("material_id,stance,original_value,granulometry_id,material_catalog(name_fr,family),material_granulometries(label_fr)")
          .eq("submission_id", submissionId),
        supabase.from("submission_material_conditions")
          .select("condition_key,stance,original_text").eq("submission_id", submissionId),
        supabase.from("material_review_queue")
          .select("original_text,source_field,reason").eq("submission_id", submissionId).eq("status", "pending"),
        supabase.from("submission_fill_profile")
          .select("acceptance_scope,capacity_kind,capacity_value,capacity_unit,environment_status,accepted_truck_codes,heavy_truck_access,confirmed_at")
          .eq("submission_id", submissionId).maybeSingle(),
      ]);
      if (!alive) return;
      setRows((rel.data ?? []) as unknown as Row[]);
      setConditions(cond.data ?? []);
      setPending(rev.data ?? []);
      setProfile((prof.data ?? null) as FillProfile | null);
    })();
    return () => { alive = false; };
  }, [submissionId]);

  const byStance = (s: string) => (rows ?? []).filter((r) => r.stance === s);
  const nameOf = (r: Row) =>
    `${r.material_catalog?.name_fr ?? "?"}${r.material_granulometries?.label_fr ? ` · ${r.material_granulometries.label_fr}` : ""}`;
  const restrictions = conditions.filter((c) => c.stance === "forbidden");
  const granulometries = Array.from(
    new Set((rows ?? []).map((r) => r.material_granulometries?.label_fr).filter(Boolean) as string[]),
  );

  const hist = historicalMaterials ?? [];

  return (
    <div className="mb-3 rounded-lg border border-border bg-muted/20 p-3">
      <div className="mb-2 text-[10px] font-display font-bold uppercase tracking-wide text-foreground">
        Interprétation des matériaux — comparaison (lecture seule, hors production)
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Ancienne interprétation (en production)</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {hist.length === 0 && <span className="text-xs text-muted-foreground">Aucun matériau historique.</span>}
            {hist.map((m, i) => <Badge key={`${m}-${i}`} variant="outline" className="text-[10px]">{m}</Badge>)}
          </div>
          {otherMaterial && <p className="mt-1 text-xs text-muted-foreground">Texte libre : « {otherMaterial} »</p>}
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Nouvelle interprétation (canonique)</p>
          {rows === null ? (
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Chargement…</div>
          ) : (
            <div className="mt-1 flex flex-wrap gap-1">
              {rows.length === 0 && <span className="text-xs text-muted-foreground">Aucune correspondance certaine.</span>}
              {rows.map((r, i) => (
                <Badge key={i} className="text-[10px]">
                  {r.material_catalog?.name_fr ?? "?"}
                  {r.material_granulometries?.label_fr ? ` · ${r.material_granulometries.label_fr}` : ""}
                  {r.stance !== "accepted" ? ` (${r.stance})` : ""}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {conditions.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold text-muted-foreground">Conditions détectées</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {conditions.map((c, i) => (
              <Badge key={i} variant="secondary" className="text-[10px]" title={c.original_text ?? ""}>
                {c.condition_key} : {c.stance === "forbidden" ? "refusé" : c.stance === "accepted" ? "exigé" : "inconnu"}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold text-muted-foreground">À valider par un humain ({pending.length})</p>
          <ul className="mt-1 space-y-0.5">
            {pending.map((p, i) => (
              <li key={i} className="text-xs text-muted-foreground">« {p.original_text} » — {p.source_field}{p.reason ? ` · ${p.reason}` : ""}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 grid gap-2 rounded-md border border-border bg-background/60 p-2 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Matériaux acceptés</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {byStance("accepted").length === 0 && <span className="text-xs text-muted-foreground">Aucun.</span>}
            {byStance("accepted").map((r, i) => <Badge key={i} className="text-[10px]">{nameOf(r)}</Badge>)}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Matériaux refusés</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {byStance("refused").length === 0 && <span className="text-xs text-muted-foreground">Aucun.</span>}
            {byStance("refused").map((r, i) => <Badge key={i} variant="destructive" className="text-[10px]">{nameOf(r)}</Badge>)}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground">À confirmer</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {byStance("unknown").length === 0 && pending.length === 0 && <span className="text-xs text-muted-foreground">Aucun.</span>}
            {byStance("unknown").map((r, i) => <Badge key={i} variant="outline" className="text-[10px]">{nameOf(r)}</Badge>)}
            {pending.length > 0 && <Badge variant="outline" className="text-[10px]">{pending.length} à valider</Badge>}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Restrictions</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {restrictions.length === 0 && <span className="text-xs text-muted-foreground">Aucune.</span>}
            {restrictions.map((c, i) => <Badge key={i} variant="destructive" className="text-[10px]">{c.condition_key}</Badge>)}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Granulométries</p>
          <p className="mt-1 text-xs text-muted-foreground">{granulometries.length ? granulometries.join(", ") : "Non précisées."}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Conditions déclarées</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {conditions.length ? conditions.map((c) => c.condition_key).join(", ") : "Aucune."}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Environnement</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {profile?.environment_status ?? "UNKNOWN"} — aucune déduction automatique.
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Capacité</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {profile
              ? `${CAPACITY_LABEL[profile.capacity_kind] ?? profile.capacity_kind}${profile.capacity_value != null ? ` — ${profile.capacity_value} ${profile.capacity_unit ?? ""}` : ""}`
              : "Capacité inconnue (aucune fiche structurée)."}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Camions</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {profile?.accepted_truck_codes?.length ? profile.accepted_truck_codes.join(", ") : "Non précisés."}
            {profile?.heavy_truck_access ? ` · accès camion lourd : ${profile.heavy_truck_access}` : ""}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Portée de l'acceptation</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {profile ? SCOPE_LABEL[profile.acceptance_scope] ?? profile.acceptance_scope : "Inconnue (aucune fiche structurée)."}
            {profile && !profile.confirmed_at ? " · jamais confirmée par un humain" : ""}
          </p>
        </div>
      </div>

      <p className="mt-2 text-[10px] text-muted-foreground">
        Lecture seule. Aucune donnée historique modifiée. Absence de relation = inconnu, jamais refusé.
      </p>
    </div>
  );
}
