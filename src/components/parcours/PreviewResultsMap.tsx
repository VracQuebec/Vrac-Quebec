// Carte simple de l'aperçu : point de départ + endroits proposés.
// Volontairement minimaliste (aucune couche supplémentaire, aucune donnée privée).
import { useEffect, useRef } from "react";
import { loadGoogleMaps } from "@/lib/google-maps-loader";

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  title: string;
  km: number | null;
}

interface Props {
  origin: { lat: number; lng: number } | null;
  points: MapPoint[];
  onSelect?: (id: string) => void;
}

export default function PreviewResultsMap({ origin, points, onSelect }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !ref.current) return;
        const center = origin ?? points[0] ?? { lat: 46.81, lng: -71.21 };
        const map = new g.maps.Map(ref.current, {
          center,
          zoom: origin ? 9 : 7,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        if (origin) {
          new g.maps.Marker({
            position: origin,
            map,
            title: "Point de départ",
            icon: {
              path: g.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: "#111111",
              fillOpacity: 1,
              strokeColor: "#7ED321",
              strokeWeight: 3,
            },
          });
        }
        points.forEach((p) => {
          const marker = new g.maps.Marker({
            position: { lat: p.lat, lng: p.lng },
            map,
            title: p.km != null ? `${p.title} — ${p.km.toFixed(1)} km` : p.title,
          });
          if (onSelect) marker.addListener("click", () => onSelect(p.id));
        });
      })
      .catch(() => {
        /* la carte reste optionnelle : la liste demeure disponible */
      });
    return () => {
      cancelled = true;
    };
  }, [origin, points, onSelect]);

  return (
    <div
      ref={ref}
      aria-label="Carte des endroits proposés"
      className="h-[60vh] min-h-64 w-full overflow-hidden rounded-lg border border-border bg-muted"
    />
  );
}
