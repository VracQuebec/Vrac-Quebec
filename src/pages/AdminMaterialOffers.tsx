// ============================================================
// LOT 20 — OFFRES DE MATÉRIAUX (interne / admin / expérimental)
// ------------------------------------------------------------
// Lecture seule côté demandes de remblai : aucune confirmation de
// match, aucun statut CRM modifié, aucune communication. La création
// d'une offre est un geste humain explicite, protégé par le drapeau
// `material_offers_v1` (FAUX en production).
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, PackageSearch } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isFeatureEnabled } from "@/lib/flags";
import { displayCity } from "@/lib/text/display";
import { buildAcceptanceProfile } from "@/lib/qualification/lot13";
import { buildEnrichedProfile, type EnrichedProfile } from "@/lib/qualification/lot15";
import { parseMaterialDescription, type ParsedMaterialDescription } from "@/lib/material-language";
import { MATERIAL_LABELS } from "@/lib/matching/interpreter";
import {
  createMaterialOffer, listMaterialOffers,
} from "@/lib/offers/api";
import {
  matchOffer, offerDraftFromParsed, offerQuality, planOfferSplit,
  type OfferMatchRow, type RequestTarget,
} from "@/lib/offers/engine";
import { DISTANCE_BAND_LABELS } from "@/lib/offers/distance";
import {
  ENVIRONMENTAL_LABELS, OFFER_STATUS_LABELS, type MaterialOffer,
} from "@/lib/offers/types";

interface Row {
  id: string; dompe_number: string | null; city: string | null;
  status: string | null; availability_status: string | null;
  availability_confirmed_by: string | null; availability_updated_at: string | null;
  description: string | null; other_material: string | null; materials: string[] | null;
}

const textOf = (r: Row) =>
  [r.description, r.other_material, (r.materials ?? []).join(", ")].filter(Boolean).join(". ");

function CreateOffer({ onCreated }: { onCreated: (o: MaterialOffer) => void }) {
  const writesEnabled = isFeatureEnabled("material_offers_v1");
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedMaterialDescription | null>(null);
  const [city, setCity] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!parsed) return;
    setSaving(true);
    try {
      const draft = offerDraftFromParsed(parsed, {
        city: city.trim() || parsed.location?.raw || null,
        latitude: lat.trim() ? Number(lat) : null,
        longitude: lng.trim() ? Number(lng) : null,
        geocoding_source: lat.trim() && lng.trim() ? "manual_input" : null,
      });
      const offer = await createMaterialOffer(draft);
      toast.success("Offre créée (interne).");
      onCreated(offer);
      setText(""); setParsed(null); setCity(""); setLat(""); setLng("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Création impossible");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 rounded-lg border border-border p-3">
      <p className="text-sm font-semibold">Décrivez le matériau disponible</p>
      <Textarea
        className="mt-2"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ex. : J'ai environ 400 tonnes de terre sablonneuse avec un peu de glaise et quelques petites roches à Beauport."
      />
      <Button className="mt-2 w-full sm:w-auto" onClick={() => setParsed(parseMaterialDescription(text))} disabled={!text.trim()}>
        Analyser
      </Button>

      {parsed && (
        <div className="mt-3 rounded-md bg-muted/30 p-3 text-sm">
          <p className="font-semibold">Nous avons compris</p>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {parsed.materials.map((m, i) => (
              <li key={i}>• {MATERIAL_LABELS[m.type] ?? m.type} — {m.role} (confiance {Math.round(m.confidence * 100)} %)</li>
            ))}
            <li>• Quantité : {parsed.quantity?.value ?? "inconnue"} {parsed.quantity?.unit ?? ""}{parsed.quantity?.approximate ? " (approximative)" : ""}</li>
            <li>• Calibre : {parsed.granulometry?.maxInches != null ? `max ${parsed.granulometry.maxInches} po` : "non précisé"}</li>
            <li>• Lieu interprété : {parsed.location?.raw ?? "non précisé"}</li>
            <li>• Environnement : {parsed.contamination.statedClean ? "déclaré propre par l'utilisateur — non vérifié" : parsed.contamination.statedContaminated ? "déclaré contaminé par l'utilisateur — non vérifié" : "inconnu"}</li>
          </ul>
          {parsed.clarificationQuestions.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              À clarifier : {parsed.clarificationQuestions.map((q) => q.text).join(" · ")}
            </p>
          )}

          <p className="mt-3 text-xs font-semibold">Corriger si nécessaire</p>
          <div className="mt-1 grid gap-2 sm:grid-cols-3">
            <Input placeholder="Ville" value={city} onChange={(e) => setCity(e.target.value)} />
            <Input placeholder="Latitude (optionnel)" value={lat} onChange={(e) => setLat(e.target.value)} />
            <Input placeholder="Longitude (optionnel)" value={lng} onChange={(e) => setLng(e.target.value)} />
          </div>

          <Button className="mt-3 w-full sm:w-auto" onClick={create} disabled={!writesEnabled || saving}>
            {saving ? "Création…" : "Créer l'offre"}
          </Button>
          {!writesEnabled && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Création désactivée : drapeau <code>material_offers_v1</code> inactif.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function OfferDetail({ offer, targets }: { offer: MaterialOffer; targets: RequestTarget[] }) {
  const rows: OfferMatchRow[] = useMemo(() => matchOffer(offer, targets), [offer, targets]);
  const split = useMemo(() => planOfferSplit(offer, targets), [offer, targets]);
  const quality = offerQuality(offer);

  return (
    <div className="mt-2 rounded-md border border-border bg-muted/20 p-3 text-xs">
      <p className="text-sm font-semibold">Données interprétées</p>
      <p className="text-muted-foreground">{offer.raw_description ?? "Aucune description"}</p>
      <p className="mt-1 text-muted-foreground">
        Localisation : {displayCity(offer.city, "ville inconnue")}
        {offer.latitude != null && offer.longitude != null
          ? ` · ${offer.latitude}, ${offer.longitude} (${offer.geocoding_source ?? "source inconnue"})`
          : " · coordonnées non renseignées"}
      </p>
      <p className="text-muted-foreground">{ENVIRONMENTAL_LABELS[offer.environmental_status]}</p>

      <p className="mt-2 font-semibold">Qualité de l'offre : {quality.percent} %</p>
      {[...quality.missingRequired, ...quality.missingRecommended, ...quality.missingOptional].length > 0 && (
        <p className="text-muted-foreground">
          Informations manquantes : {[...quality.missingRequired, ...quality.missingRecommended, ...quality.missingOptional].join(", ")}
        </p>
      )}

      <p className="mt-3 font-semibold">Matchs calculés (lecture seule)</p>
      <div className="mt-1 space-y-1">
        {rows.slice(0, 15).map((r) => (
          <div key={r.requestId} className="rounded bg-background/70 p-2">
            <p className="font-semibold text-foreground">
              {r.reference ?? r.requestId.slice(0, 8)} — {r.stateLabel}
              {r.blockedByRadius && " · hors rayon exigé"}
            </p>
            <p className="text-muted-foreground">
              {displayCity(r.city, "ville inconnue")} ·{" "}
              {r.distanceKm != null ? `${r.distanceKm} km` : "distance inconnue"}
              {r.distanceBand ? ` (${DISTANCE_BAND_LABELS[r.distanceBand]})` : ""} · capacité restante :{" "}
              {r.remainingCapacity ?? "inconnue"} · score opérationnel : {r.operational.score}
            </p>
            <p className="text-muted-foreground">Matières acceptées : {r.acceptedMaterials.join(", ") || "—"} · {r.granulometry}</p>
            <p className="text-muted-foreground">{r.reasons.slice(0, 3).join(" · ")}</p>
            {r.unlockingQuestion && <p className="text-muted-foreground">Question manquante : {r.unlockingQuestion}</p>}
          </div>
        ))}
        {rows.length === 0 && <p className="text-muted-foreground">Aucune demande candidate.</p>}
      </div>

      <p className="mt-3 font-semibold">Plan de répartition potentiel (simulation)</p>
      <p className="text-muted-foreground">
        {split.parts.length
          ? `${split.parts.map((p) => `${p.requestId.slice(0, 8)} : ${p.quantity}`).join(" · ")} — reste : ${split.leftover}`
          : "Aucune répartition calculable (quantité ou capacité inconnue)."}
      </p>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Simulation uniquement : aucune réservation, aucune confirmation, aucune communication.
      </p>
    </div>
  );
}

export default function AdminMaterialOffers() {
  const { isReady } = useAuthReady();
  const { isAdmin, loading: rolesLoading } = useUserRoles();
  const [offers, setOffers] = useState<MaterialOffer[] | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isReady || !isAdmin) return;
    setLoading(true);
    Promise.all([
      listMaterialOffers().catch((e) => { toast.error(e.message); return [] as MaterialOffer[]; }),
      supabase
        .from("submissions")
        .select("id,dompe_number,city,status,availability_status,availability_confirmed_by,availability_updated_at,description,other_material,materials")
        .eq("request_type", "remblai")
        .order("created_at", { ascending: false })
        .limit(200),
    ]).then(([o, res]) => {
      setOffers(o);
      if (res.error) toast.error(res.error.message);
      setRows((res.data ?? []) as Row[]);
      setLoading(false);
    });
  }, [isReady, isAdmin]);

  const targets: RequestTarget[] = useMemo(
    () =>
      rows.map((r) => {
        const acceptance = buildAcceptanceProfile({
          submissionId: r.id, reference: r.dompe_number, text: textOf(r),
          available: r.availability_status === "available",
          lastConfirmedAt: r.availability_confirmed_by ? r.availability_updated_at ?? null : null,
        });
        const profile: EnrichedProfile = buildEnrichedProfile(acceptance);
        return { profile, reference: r.dompe_number, city: r.city };
      }),
    [rows],
  );

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

      <div className="sticky top-0 z-20 -mx-4 mt-3 border-y border-primary/40 bg-primary/10 px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide sm:-mx-6 sm:px-6">
        Mode expérimental — aucun match n'est confirmé, aucune communication n'est envoyée
      </div>

      <h1 className="mt-3 flex items-center gap-2 font-display text-xl font-bold sm:text-2xl">
        <PackageSearch className="h-6 w-6" /> Offres de matériaux
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {targets.length} demande(s) de remblai chargée(s) pour le calcul des matchs.
      </p>

      <CreateOffer onCreated={(o) => setOffers((prev) => [o, ...(prev ?? [])])} />

      {loading && <p className="mt-4 text-sm text-muted-foreground">Chargement…</p>}

      <div className="mt-4 space-y-2">
        {(offers ?? []).map((o) => {
          const q = offerQuality(o);
          const matches = matchOffer(o, targets).filter((m) => m.state !== "INCOMPATIBLE").length;
          return (
            <div key={o.id} className="rounded-lg border border-border p-3">
              <button type="button" className="w-full text-left" onClick={() => setOpenId(openId === o.id ? null : o.id)}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">
                    {o.quantity_value ?? "?"} {o.quantity_unit ?? ""} ·{" "}
                    {o.principal_material ? MATERIAL_LABELS[o.principal_material] ?? o.principal_material : "matériau principal inconnu"}
                  </span>
                  <Badge variant="outline">{OFFER_STATUS_LABELS[o.status]}</Badge>
                  <Badge variant="secondary">{matches} match(s) potentiel(s)</Badge>
                  <span className="text-xs text-muted-foreground">Qualité {q.percent} %</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[...o.secondary_materials, ...o.trace_materials].map((k) => `+ ${MATERIAL_LABELS[k] ?? k}`).join(" ")} ·{" "}
                  {displayCity(o.city, "ville inconnue")} · confiance parser{" "}
                  {o.parser_confidence != null ? `${Math.round(o.parser_confidence * 100)} %` : "—"}
                </p>
              </button>
              {openId === o.id && <OfferDetail offer={o} targets={targets} />}
            </div>
          );
        })}
        {offers && offers.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucune offre enregistrée pour l'instant.</p>
        )}
      </div>
    </div>
  );
}
