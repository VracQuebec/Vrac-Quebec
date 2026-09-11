// ============================================================
// « ANNUAIRE PROFESSIONNEL » — V1, mobile-first, lecture seule.
// Affiche uniquement l'identité professionnelle publique.
// Aucune carte, aucune distance, aucune messagerie.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Loader2, MapPin, Search, SlidersHorizontal, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BottomSheet } from "@/components/entrepreneur-app/ui";
import {
  loadAnnuaire,
  filterAnnuaire,
  buildFacets,
  applyProximity,
  proximityLabel,
  EMPTY_FILTERS,
  type AnnuaireFilters,
  type AnnuaireProfil,
  type AnnuaireResult,
} from "@/lib/parcours/annuaire";
import { loadMyProfil } from "@/lib/parcours/profil";
import type { PublicLocalisation } from "@/lib/parcours/localisation";

const PAGE_SIZE = 24;

const Select = ({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) =>
  options.length === 0 ? null : (
    <label className="flex-1 min-w-[9rem]">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-border bg-background px-3 font-body text-sm"
      >
        <option value="">{label} : toutes</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );

/** Carte tactile : nom, localisation, proximité, camions. Détails en feuille. */
const ProfilCard = ({ p, onOpen }: { p: AnnuaireProfil; onOpen: () => void }) => (
  <button
    type="button"
    onClick={onOpen}
    className="w-full rounded-2xl border border-border bg-card p-4 text-left transition-transform active:scale-[0.99] hover:border-primary/60"
  >
    <div className="flex items-start gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 font-display text-sm font-extrabold text-primary">
        {p.company.trim().slice(0, 2).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-display text-base font-bold">{p.company}</h3>
        <p className="mt-0.5 flex items-center gap-1 font-body text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">{p.locationLabel ?? "Localisation non renseignée"}</span>
        </p>
        {proximityLabel(p.proximity) && (
          <span className="mt-1.5 inline-flex rounded-full bg-primary/10 px-2 py-0.5 font-body text-[11px] text-primary">
            {proximityLabel(p.proximity)}
          </span>
        )}
        {p.truckTypes.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {p.truckTypes.slice(0, 3).map((t) => (
              <li
                key={t}
                className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 font-body text-[11px] text-muted-foreground"
              >
                <Truck className="h-3 w-3" aria-hidden /> {t}
              </li>
            ))}
            {p.truckTypes.length > 3 && (
              <li className="rounded-full bg-secondary px-2 py-0.5 font-body text-[11px] text-muted-foreground">
                +{p.truckTypes.length - 3}
              </li>
            )}
          </ul>
        )}
      </div>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
    </div>
  </button>
);

/** Détail d'un profil public — aucune coordonnée privée. */
const ProfilDetail = ({ p }: { p: AnnuaireProfil }) => (
  <div className="space-y-3">
    <div className="flex items-center gap-3">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 font-display font-extrabold text-primary">
        {p.company.trim().slice(0, 2).toUpperCase()}
      </span>
      <div className="min-w-0">
        <p className="truncate font-display text-base font-bold">{p.company}</p>
        <p className="truncate font-body text-xs text-muted-foreground">
          {p.locationLabel ?? "Localisation non renseignée"}
        </p>
      </div>
    </div>
    <dl className="divide-y divide-border overflow-hidden rounded-2xl border border-border font-body text-sm">
      {[
        ["Ville", p.city ?? "Non renseignée"],
        ["Province", p.provinceName ?? p.province ?? "Non renseignée"],
        ["Région", p.region ?? "Non renseignée"],
        ...(p.postalSector ? [["Secteur postal", p.postalSector]] : []),
        ...(p.truckCount ? [["Camions", `${p.truckCount}`]] : []),
      ].map(([k, v]) => (
        <div key={k as string} className="flex justify-between gap-3 px-3 py-2.5">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="text-right">{v}</dd>
        </div>
      ))}
    </dl>
    {p.truckTypes.length > 0 && (
      <ul className="flex flex-wrap gap-1.5">
        {p.truckTypes.map((t) => (
          <li key={t} className="rounded-full bg-primary/10 px-2.5 py-1 font-body text-[11px] text-primary">
            {t}
          </li>
        ))}
      </ul>
    )}
    <p className="rounded-2xl bg-secondary/60 p-3 font-body text-xs text-muted-foreground">
      Les coordonnées privées ne sont jamais diffusées dans l'annuaire.
    </p>
  </div>
);

export default function AnnuaireList() {
  const [res, setRes] = useState<AnnuaireResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<AnnuaireFilters>(EMPTY_FILTERS);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [reference, setReference] = useState<PublicLocalisation | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    // Deux lectures indépendantes seulement (aucune requête par profil).
    const [annuaire, profil] = await Promise.all([loadAnnuaire(), loadMyProfil()]);
    setRes(annuaire);
    setReference(profil.state === "ok" ? profil.profil.publicLocalisation : null);
    setLoading(false);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const profils = useMemo(
    () => applyProximity(res?.state === "ok" ? res.profils : [], reference),
    [res, reference],
  );
  const facets = useMemo(() => buildFacets(profils), [profils]);
  const filtered = useMemo(() => filterAnnuaire(profils, filters), [profils, filters]);
  const set = (patch: Partial<AnnuaireFilters>) => {
    setLimit(PAGE_SIZE);
    setFilters((f) => ({ ...f, ...patch }));
  };

  if (loading) {
    return (
      <p className="flex items-center gap-2 font-body text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Chargement de l'annuaire…
      </p>
    );
  }

  if (res?.state === "unauthorized") {
    return (
      <p className="font-body text-sm text-muted-foreground">
        Connectez-vous avec votre compte entrepreneur pour explorer le réseau.
      </p>
    );
  }

  if (res?.state !== "ok") {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="font-body text-sm text-muted-foreground">
          L'annuaire n'a pas pu être chargé. Aucune donnée approximative n'est affichée.
        </p>
        <Button variant="outline" className="mt-3 h-10" onClick={() => void reload()}>Réessayer</Button>
      </div>
    );
  }

  if (profils.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-5">
        <p className="font-body text-sm text-muted-foreground">
          Aucun entrepreneur n'est encore présent dans l'annuaire.
        </p>
      </div>
    );
  }

  const activeCount = [filters.proximity, filters.province, filters.region, filters.city, filters.truckType]
    .filter(Boolean).length;

  return (
    <div>
      {/* Recherche collante — toujours à portée du pouce */}
      <div className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 pb-3 pt-1 backdrop-blur sm:-mx-0 sm:px-0">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              className="h-12 rounded-2xl pl-9"
              placeholder="Entreprise, ville, camion…"
              aria-label="Rechercher dans l'annuaire"
              value={filters.query}
              onChange={(e) => set({ query: e.target.value })}
            />
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            aria-label="Filtrer l'annuaire"
            className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-card transition-transform active:scale-95"
          >
            <SlidersHorizontal className="h-5 w-5" />
            {activeCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 font-display text-[10px] font-bold text-primary-foreground">
                {activeCount}
              </span>
            )}
          </button>
        </div>

        {/* Filtres rapides de proximité */}
        {reference && (
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {([["", "Tous"], ["same_city", "Ma ville"], ["same_region", "Ma région"], ["same_province", "Ma province"]] as const).map(
              ([value, label]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => set({ proximity: value as AnnuaireFilters["proximity"] })}
                  className={`min-h-9 shrink-0 rounded-full px-3 font-body text-xs transition-transform active:scale-95 ${
                    filters.proximity === value ? "bg-primary text-primary-foreground" : "border border-border bg-card"
                  }`}
                >
                  {label}
                </button>
              ),
            )}
          </div>
        )}
      </div>

      <p className="mt-1 font-body text-xs text-muted-foreground">
        {filtered.length} entreprise(s) sur {profils.length}
      </p>

      {filtered.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-border p-5">
          <p className="font-body text-sm text-muted-foreground">
            Aucune entreprise ne correspond à votre recherche.
          </p>
          <Button variant="outline" className="mt-3 h-11" onClick={() => set(EMPTY_FILTERS)}>
            Réinitialiser les filtres
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.slice(0, limit).map((p) => (
              <ProfilCard key={p.id} p={p} onOpen={() => setSelected(p)} />
            ))}
          </div>
          {filtered.length > limit && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" className="h-11" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
                Afficher plus
              </Button>
            </div>
          )}
        </>
      )}

      {/* Feuille de filtres */}
      <BottomSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filtrer l'annuaire">
        <div className="space-y-4">
          <Select label="Province" value={filters.province} options={facets.provinces} onChange={(v) => set({ province: v })} />
          <Select label="Région" value={filters.region} options={facets.regions} onChange={(v) => set({ region: v })} />
          <Select label="Ville" value={filters.city} options={facets.cities} onChange={(v) => set({ city: v })} />
          <Select label="Type de camion" value={filters.truckType} options={facets.truckTypes} onChange={(v) => set({ truckType: v })} />
          <div className="flex gap-2 pt-2">
            {activeCount > 0 && (
              <button
                type="button"
                onClick={() => set(EMPTY_FILTERS)}
                className="min-h-12 flex-1 rounded-2xl border border-border font-body text-sm"
              >
                Réinitialiser
              </button>
            )}
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              className="min-h-12 flex-1 rounded-2xl bg-primary font-display text-sm font-bold text-primary-foreground"
            >
              Voir les résultats
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* Feuille de profil public */}
      <BottomSheet open={selected !== null} onOpenChange={(v) => !v && setSelected(null)} title="Profil public">
        {selected && <ProfilDetail p={selected} />}
      </BottomSheet>
    </div>
  );
}
