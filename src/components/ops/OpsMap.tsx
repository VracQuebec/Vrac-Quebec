// Carte opérationnelle : livraisons du jour et lieux de chargement.
import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/google-maps-loader";
import { Delivery, OpsRefs, statusMeta, todayISO } from "@/lib/jsc/operations";
import { Loader2 } from "lucide-react";

interface Props {
  deliveries: Delivery[];
  refs: OpsRefs;
  onOpen: (d: Delivery) => void;
}

export default function OpsMap({ deliveries, refs, onOpen }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [onlyToday, setOnlyToday] = useState(true);

  useEffect(() => {
    let markers: google.maps.Marker[] = [];
    let cancelled = false;
    loadGoogleMaps()
      .then((google) => {
        if (cancelled || !ref.current) return;
        const map = new google.maps.Map(ref.current, {
          center: { lat: 46.81, lng: -71.21 },
          zoom: 8,
          mapTypeControl: false,
          streetViewControl: false,
        });
        setReady(true);
        const list = deliveries.filter((d) => d.latitude && d.longitude && (!onlyToday || d.scheduled_date === todayISO()));
        const bounds = new google.maps.LatLngBounds();
        list.forEach((d) => {
          const st = statusMeta(d.status);
          const m = new google.maps.Marker({
            position: { lat: Number(d.latitude), lng: Number(d.longitude) },
            map,
            title: `${d.delivery_number ?? ""} · ${d.city ?? ""}`,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 9,
              fillColor: st.color,
              fillOpacity: 1,
              strokeColor: "#111111",
              strokeWeight: 1.5,
            },
          });
          m.addListener("click", () => onOpen(d));
          markers.push(m);
          bounds.extend(m.getPosition()!);
        });
        refs.pickups.filter((p) => p.latitude && p.longitude).forEach((p) => {
          const m = new google.maps.Marker({
            position: { lat: Number(p.latitude), lng: Number(p.longitude) },
            map,
            title: p.name,
            icon: { path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW, scale: 5, fillColor: "#111111", fillOpacity: 1, strokeColor: "#7ED321", strokeWeight: 2 },
          });
          markers.push(m);
          bounds.extend(m.getPosition()!);
        });
        if (markers.length) map.fitBounds(bounds, 60);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Carte indisponible"));
    return () => { cancelled = true; markers.forEach((m) => m.setMap(null)); markers = []; };
  }, [deliveries, refs, onlyToday, onOpen]);

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={onlyToday} onChange={(e) => setOnlyToday(e.target.checked)} />
        Afficher uniquement les livraisons du jour
      </label>
      {error && <div className="rounded-xl border border-border p-4 text-xs text-destructive">{error}</div>}
      <div className="relative rounded-xl overflow-hidden border border-border" style={{ height: 560 }}>
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground bg-secondary/30">
            <Loader2 className="w-4 h-4 animate-spin" /> Chargement de la carte…
          </div>
        )}
        <div ref={ref} className="w-full h-full" />
      </div>
    </div>
  );
}