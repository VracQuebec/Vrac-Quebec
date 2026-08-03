// Carte opérationnelle globale — livraisons, fournisseurs, chantiers, incidents et zones sans approvisionnement.
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { loadGoogleMaps } from "@/lib/google-maps-loader";
import { CAD, NUM, type MapData } from "@/lib/jsc/orchestrator";

const LAYERS = [
  { key: "deliveries", label: "Livraisons", color: "#7ED321" },
  { key: "pickups", label: "Lieux de chargement", color: "#0EA5E9" },
  { key: "suppliers", label: "Fournisseurs", color: "#F59E0B" },
  { key: "clients", label: "Clients", color: "#6366F1" },
  { key: "projects", label: "Chantiers", color: "#111111" },
  { key: "incidents", label: "Incidents", color: "#EF4444" },
] as const;
type LayerKey = (typeof LAYERS)[number]["key"];

export default function OrchMapView({ data }: { data: MapData }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState<Record<LayerKey, boolean>>({
    deliveries: true, pickups: true, suppliers: true, clients: false, projects: true, incidents: true,
  });

  useEffect(() => {
    let markers: google.maps.Marker[] = [];
    let cancelled = false;
    loadGoogleMaps()
      .then((google) => {
        if (cancelled || !ref.current) return;
        const map = new google.maps.Map(ref.current, {
          center: { lat: 46.81, lng: -71.21 }, zoom: 7,
          mapTypeControl: false, streetViewControl: false,
        });
        setReady(true);
        const bounds = new google.maps.LatLngBounds();
        const add = (lat: number, lng: number, title: string, color: string) => {
          const m = new google.maps.Marker({
            position: { lat: Number(lat), lng: Number(lng) }, map, title,
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: color, fillOpacity: 1, strokeColor: "#111111", strokeWeight: 1.5 },
          });
          markers.push(m);
          bounds.extend(m.getPosition()!);
        };
        LAYERS.forEach((layer) => {
          if (!active[layer.key]) return;
          const rows = (data[layer.key] ?? []) as Record<string, unknown>[];
          rows.forEach((p) => {
            const lat = Number(p.latitude), lng = Number(p.longitude);
            if (!lat || !lng) return;
            const title = String(p.name ?? p.delivery_number ?? p.incident_type ?? layer.label);
            add(lat, lng, `${title}${p.city ? ` · ${p.city}` : ""}`, layer.color);
          });
        });
        if (markers.length) map.fitBounds(bounds, 60);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Carte indisponible"));
    return () => { cancelled = true; markers.forEach((m) => m.setMap(null)); markers = []; };
  }, [data, active]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {LAYERS.map((l) => (
          <label key={l.key} className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs">
            <input type="checkbox" checked={active[l.key]} onChange={(e) => setActive((s) => ({ ...s, [l.key]: e.target.checked }))} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
            {l.label} ({((data[l.key] ?? []) as unknown[]).length})
          </label>
        ))}
      </div>
      {error && <div className="rounded-xl border border-border p-4 text-xs text-destructive">{error}</div>}
      <div className="relative overflow-hidden rounded-xl border border-border" style={{ height: 520 }}>
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-secondary/30 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement de la carte…
          </div>
        )}
        <div ref={ref} className="h-full w-full" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">Villes les plus rentables (90 jours)</h3>
          {data.city_stats.length === 0 ? <p className="text-sm text-muted-foreground">Aucune commande géolocalisée.</p> : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground"><tr><th className="text-left">Ville</th><th className="text-right">Commandes</th><th className="text-right">CA</th><th className="text-right">Marge</th></tr></thead>
              <tbody>
                {data.city_stats.slice(0, 12).map((c) => (
                  <tr key={c.city} className="border-t border-border/50">
                    <td className="py-1.5">{c.city}</td>
                    <td className="py-1.5 text-right">{NUM(c.orders)}</td>
                    <td className="py-1.5 text-right">{CAD(c.revenue)}</td>
                    <td className="py-1.5 text-right">{NUM(c.margin_pct, 1)} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">Zones sans approvisionnement</h3>
          {data.shortage_cities.length === 0 ? <p className="text-sm text-muted-foreground">Toutes les villes demandées sont desservies.</p> : (
            <ul className="space-y-1 text-sm">
              {data.shortage_cities.map((c) => (
                <li key={c.city} className="flex justify-between border-b border-border/50 py-1.5">
                  <span>{c.city}</span><span className="text-muted-foreground">{NUM(c.requests)} demande(s) sans fournisseur</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
