// ============================================================
// Point 13 — Calculateur de quantité de matériaux (mobile d'abord).
// Densités et camions 100 % administrables ; aucune estimation de prix ici.
// ============================================================
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Calculator, Info, Truck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEPTH_UNITS, LENGTH_UNITS, computeVolume, fmt, roundTo, useCalcMaterials,
  type DepthUnit, type LengthUnit,
} from "@/lib/vrac/calculator";
import { usePublicTrucks } from "@/lib/vrac/units";

const chip = (active: boolean) =>
  `min-h-11 rounded-xl border px-3 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
    active ? "border-[2px] border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:border-primary/40"
  }`;

const MaterialCalculator = () => {
  const { materials, loading } = useCalcMaterials();
  const trucks = usePublicTrucks();

  const [slug, setSlug] = useState<string>("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [depth, setDepth] = useState("");
  const [lengthUnit, setLengthUnit] = useState<LengthUnit>("pi");
  const [depthUnit, setDepthUnit] = useState<DepthUnit>("po");

  const material = materials.find((m) => m.slug === slug) ?? null;

  const result = useMemo(
    () =>
      computeVolume(
        Number(length), lengthUnit,
        Number(width), lengthUnit,
        Number(depth), depthUnit,
        material?.density_kg_per_m3 ?? null,
      ),
    [length, width, depth, lengthUnit, depthUnit, material],
  );

  const tonnes = result?.tonnes ?? null;

  const quoteHref = useMemo(() => {
    if (!material || !tonnes || !(tonnes > 0)) return null;
    const params = new URLSearchParams({
      material: material.slug,
      qty: String(roundTo(tonnes, 1)),
      unit: "tonne",
    });
    return `/acheter-materiaux?${params.toString()}`;
  }, [material, tonnes]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="calc-material" className="font-display text-sm font-bold text-foreground">
          Matériau
        </Label>
        <select
          id="calc-material"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="h-12 w-full rounded-xl border border-input bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <option value="">{loading ? "Chargement…" : "Choisir un matériau"}</option>
          {materials.map((m) => (
            <option key={m.slug} value={m.slug}>{m.name}</option>
          ))}
        </select>
        {!loading && materials.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Les densités ne sont pas encore configurées. Le tonnage sera confirmé par notre équipe.
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-sm font-bold text-foreground">Dimensions en</span>
          {LENGTH_UNITS.map((u) => (
            <button key={u.value} type="button" aria-pressed={lengthUnit === u.value}
              onClick={() => setLengthUnit(u.value)} className={chip(lengthUnit === u.value)}>
              {u.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="calc-l">Longueur ({lengthUnit})</Label>
            <Input id="calc-l" inputMode="decimal" placeholder="ex. 30" value={length}
              onChange={(e) => setLength(e.target.value)} className="h-12 text-base" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="calc-w">Largeur ({lengthUnit})</Label>
            <Input id="calc-w" inputMode="decimal" placeholder="ex. 20" value={width}
              onChange={(e) => setWidth(e.target.value)} className="h-12 text-base" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="calc-d">Épaisseur</Label>
          <div className="flex gap-2">
            <Input id="calc-d" inputMode="decimal" placeholder="ex. 4" value={depth}
              onChange={(e) => setDepth(e.target.value)} className="h-12 flex-1 text-base" />
            <select
              aria-label="Unité d'épaisseur"
              value={depthUnit}
              onChange={(e) => setDepthUnit(e.target.value as DepthUnit)}
              className="h-12 rounded-xl border border-input bg-background px-3 text-base text-foreground"
            >
              {DEPTH_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {result ? (
        <div className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-5">
          <p className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-foreground">
            <Calculator className="h-4 w-4 text-primary" aria-hidden /> Volume estimé
          </p>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            {[
              { v: result.m3, u: "m³" },
              { v: result.yd3, u: "vg³" },
              { v: result.ft3, u: "pi³" },
            ].map((x) => (
              <div key={x.u} className="rounded-xl bg-background p-3">
                <p className="font-display text-xl font-extrabold text-foreground">{fmt(x.v)}</p>
                <p className="text-xs text-muted-foreground">{x.u}</p>
              </div>
            ))}
          </div>

          {tonnes ? (
            <p className="mt-4 font-body text-sm text-foreground">
              Soit environ <span className="font-display text-lg font-extrabold">{fmt(tonnes)} tonnes</span>{" "}
              de {material?.name.toLowerCase()}.
            </p>
          ) : (
            <p className="mt-4 font-body text-sm text-muted-foreground">
              Choisissez un matériau pour convertir ce volume en tonnes.
            </p>
          )}

          {tonnes && trucks.length > 0 && (
            <div className="mt-4 space-y-1.5">
              <p className="flex items-center gap-2 font-display text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <Truck className="h-4 w-4" aria-hidden /> Nombre de voyages estimé
              </p>
              {trucks.map((t) => {
                const trips = Math.ceil(tonnes / t.capacity_tonnes);
                return (
                  <p key={t.id} className="font-body text-sm text-foreground">
                    {t.name} ({t.capacity_tonnes} t) : <strong>{trips} voyage{trips > 1 ? "s" : ""}</strong>
                  </p>
                );
              })}
            </div>
          )}

          <p className="mt-4 flex items-start gap-2 font-body text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Estimation indicative basée sur des dimensions rectangulaires. Le tonnage réel varie selon
            la compaction et l'humidité du matériau; notre équipe valide la quantité avec vous.
          </p>

          {quoteHref && (
            <Link
              to={quoteHref}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-4 font-display text-sm font-bold uppercase tracking-wide text-primary-foreground shadow-lg"
            >
              Obtenir un prix pour {fmt(tonnes!)} tonnes <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      ) : (
        <p className="rounded-2xl border border-border bg-muted/40 p-4 font-body text-sm text-muted-foreground">
          Entrez la longueur, la largeur et l'épaisseur pour obtenir le volume et le tonnage approximatifs.
        </p>
      )}
    </div>
  );
};

export default MaterialCalculator;