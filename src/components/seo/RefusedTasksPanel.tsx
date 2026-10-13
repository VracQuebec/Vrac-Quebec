import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { displayCityName, buildRefusedRows, filterRefused, comboKeyOf, REFUSED_STATUSES, type RefusedTaskRaw, type RefusedRow, type RefusedFilters } from "@/lib/seo/refusedTasks";

type Props = {
  cityName: (slug: string) => string | null;
  comboLabel: (city: string, t: RefusedTaskRaw) => string | null;
  availability: (city: string, t: RefusedTaskRaw) => RefusedRow["availability"];
  onOpenCity: (slug: string, name: string) => void;
};
const AV: Record<string, string> = { confirmee: "Confirmée", exclue: "Exclue", inconnue: "Inconnue", absente: "Non disponible" };
const fmt = (s: string) => new Date(s).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Toronto" });

/** Consultation seule des tâches refusées : aucune action ne modifie, relance ou supprime une tâche. */
export default function RefusedTasksPanel({ cityName, comboLabel, availability, onOpenCity }: Props) {
  const [raw, setRaw] = useState<RefusedTaskRaw[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState<RefusedFilters>({ city: "", combo: "", availability: "", reason: "" });
  useEffect(() => {
    void supabase.from("seo_page_tasks")
      .select("id, city_slug, material_slug, service_slug, status, attempts, last_error, updated_at, finished_at")
      .in("status", [...REFUSED_STATUSES]).order("updated_at", { ascending: false }).limit(1000)
      .then(({ data, error }) => { if (error) setErr(error.message); else setRaw((data ?? []) as RefusedTaskRaw[]); });
  }, []);
  const rows = useMemo(() => buildRefusedRows(raw ?? [], { cityName, comboLabel, availability }), [raw, cityName, comboLabel, availability]);
  const shown = filterRefused(rows, f);
  const opts = (fn: (r: RefusedRow) => [string, string]) => [...new Map(rows.map(fn)).entries()].sort((a, b) => a[1].localeCompare(b[1], "fr"));
  const sel = (k: keyof RefusedFilters, label: string, o: [string, string][]) => (
    <label className="text-xs flex flex-col gap-1 min-w-0">{label}
      <select aria-label={label} className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}>
        <option value="">Tous</option>{o.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select></label>);

  return (
    <Card className="p-4 md:p-6 space-y-3" aria-label="Tâches refusées">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-display font-bold">Tâches refusées</h3>
        <Badge variant="secondary">{raw ? `${shown.length} affichée(s) sur ${rows.length}` : "Chargement…"}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">Consultation seule : ces tâches sont conservées avec leur historique. Rien ici ne les relance, ne les modifie ni ne lance de génération.</p>
      {err && <p className="text-sm text-destructive">Lecture impossible : {err}</p>}
      {raw && rows.length > 0 && (
        <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
          {sel("city", "Ville", opts((r) => [r.city_slug, displayCityName(r.cityName, r.city_slug)]))}
          {sel("combo", "Matériau / service", opts((r) => [comboKeyOf(r), r.comboLabel ?? "Non disponible"]))}
          {sel("availability", "Disponibilité", opts((r) => [r.availability ?? "absente", AV[r.availability ?? "absente"]]))}
          {sel("reason", "Motif", opts((r) => [r.reason ?? "absent", r.reason ?? "Motif non enregistré"]))}
        </div>
      )}
      {raw && rows.length === 0 && <p className="text-sm text-muted-foreground">Aucune tâche refusée.</p>}
      <ul className="divide-y divide-border">
        {shown.map((r) => (
          <li key={r.id} className="py-2 flex flex-wrap items-start justify-between gap-2 text-sm">
            <div className="min-w-0 space-y-0.5">
              <p className="font-semibold">{displayCityName(r.cityName, r.city_slug)} — {r.comboLabel ?? "Combinaison non disponible"}</p>
              <p className="text-xs text-muted-foreground">Refusée le {fmt(r.refusedAt)} · Disponibilité : {AV[r.availability ?? "absente"]}</p>
              <p className="text-xs">Motif : {r.reason ?? "Motif non enregistré"}</p>
            </div>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onOpenCity(r.city_slug, displayCityName(r.cityName, r.city_slug))}>Ouvrir la fiche de la ville</Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
