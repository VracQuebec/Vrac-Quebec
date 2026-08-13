// ============================================================
// « ANNUAIRE PROFESSIONNEL » — V1, mobile-first, lecture seule.
// Affiche uniquement l'identité professionnelle publique.
// Aucune carte, aucune distance, aucune messagerie.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Loader2, MapPin, Search, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const ProfilCard = ({ p }: { p: AnnuaireProfil }) => {
  const [open, setOpen] = useState(false);
  return (
    <article className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/60">
      <h3 className="flex items-center gap-2 font-display text-base font-bold">
        <Building2 className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden />
        <span className="truncate">{p.company}</span>
      </h3>

      <p className="mt-1 flex items-center gap-1 font-body text-xs text-muted-foreground">
        <MapPin className="h-3 w-3 flex-shrink-0" aria-hidden />
        {p.locationLabel ?? "Localisation non renseignée"}
      </p>
      {proximityLabel(p.proximity) && (
        <p className="mt-1 inline-flex rounded-full bg-primary/10 px-2 py-0.5 font-body text-[11px] text-primary">
          {proximityLabel(p.proximity)}
        </p>
      )}
      {p.region && (
        <p className="mt-0.5 font-body text-xs text-muted-foreground">Région : {p.region}</p>
      )}

      {p.truckTypes.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {p.truckTypes.map((t) => (
            <li
              key={t}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-body text-[11px] text-primary"
            >
              <Truck className="h-3 w-3" aria-hidden /> {t}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        {p.truckCount ? (
          <span className="font-body text-xs text-muted-foreground">{p.truckCount} camion(s)</span>
        ) : <span />}
        <Button variant="outline" size="sm" className="h-9" onClick={() => setOpen((v) => !v)}>
          {open ? "Masquer le profil" : "Voir le profil"}
        </Button>
      </div>

      {open && (
        <dl className="mt-3 space-y-1 border-t border-border pt-3 font-body text-xs">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Ville</dt>
            <dd>{p.city ?? "Non renseignée"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Province</dt>
            <dd>{p.provinceName ?? p.province ?? "Non renseignée"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Région</dt>
            <dd>{p.region ?? "Non renseignée"}</dd>
          </div>
          {p.postalSector && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Secteur postal</dt>
              <dd>{p.postalSector}</dd>
            </div>
          )}
          <p className="pt-2 text-muted-foreground">
            Les coordonnées privées ne sont jamais diffusées dans l'annuaire.
          </p>
        </dl>
      )}
    </article>
  );
};

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

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          className="h-11 pl-9"
          placeholder="Rechercher une entreprise, une ville, une région, un type de camion…"
          aria-label="Rechercher dans l'annuaire"
          value={filters.query}
          onChange={(e) => set({ query: e.target.value })}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {reference && (
          <label className="flex-1 min-w-[9rem]">
            <span className="sr-only">Proximité</span>
            <select
              aria-label="Proximité"
              value={filters.proximity}
              onChange={(e) => set({ proximity: e.target.value as AnnuaireFilters["proximity"] })}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 font-body text-sm"
            >
              <option value="">Proximité : tous</option>
              <option value="same_city">Même ville</option>
              <option value="same_region">Même région</option>
              <option value="same_province">Même province</option>
            </select>
          </label>
        )}
        <Select label="Province" value={filters.province} options={facets.provinces} onChange={(v) => set({ province: v })} />
        <Select label="Région" value={filters.region} options={facets.regions} onChange={(v) => set({ region: v })} />
        <Select label="Ville" value={filters.city} options={facets.cities} onChange={(v) => set({ city: v })} />
        <Select label="Type de camion" value={filters.truckType} options={facets.truckTypes} onChange={(v) => set({ truckType: v })} />
      </div>

      <p className="mt-3 font-body text-xs text-muted-foreground">
        {filtered.length} entrepreneur(s) sur {profils.length}
      </p>

      {filtered.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-border p-5">
          <p className="font-body text-sm text-muted-foreground">
            Aucun entrepreneur ne correspond à votre recherche.
          </p>
          <Button variant="outline" className="mt-3 h-10" onClick={() => set(EMPTY_FILTERS)}>
            Réinitialiser les filtres
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.slice(0, limit).map((p) => <ProfilCard key={p.id} p={p} />)}
          </div>
          {filtered.length > limit && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" className="h-10" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
                Afficher plus
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
