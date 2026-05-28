import { useEffect, useRef, useState } from "react";
import { MATERIAL_TYPES } from "@/lib/questionnaire-data";
import { colorForMaterials } from "@/lib/material-colors";
import { loadGoogleMaps } from "@/lib/google-maps-loader";

interface Submission {
  id: string;
  submission_number: number | null;
  dompe_number?: string | null;
  latitude: number | null;
  longitude: number | null;
  materials: string[];
  other_material: string | null;
  property_type: string;
  quantity: string;
  tonnage: string;
  budget_unit: string | null;
  budget_max: string | null;
  machinery_available: boolean | null;
  machinery_description: string | null;
  accessibility: string[] | null;
  address: string;
  postal_code: string | null;
  name: string;
  email: string;
  phone: string | null;
  description: string | null;
  created_at: string;
  request_type?: string | null;
  internal_notes?: string | null;
  status?: string | null;
  show_on_admin_map?: boolean | null;
}

const createNumberIconSvg = (label: string, color: string) => {
  const len = label.length;
  const fontSize = len <= 3 ? 14 : len <= 5 ? 11 : 9;
  const width = Math.max(32, 14 + len * 7);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="32" viewBox="0 0 ${width} 32">
    <rect x="1" y="1" width="${width - 2}" height="30" rx="15" fill="${color}" stroke="white" stroke-width="3"/>
    <text x="${width / 2}" y="16" dominant-baseline="central" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-weight="800" font-size="${fontSize}" fill="white">${label.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>
  </svg>`;
  return { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, width, height: 32 };
};

const displayNumber = (sub: { dompe_number?: string | null; submission_number: number | null }) =>
  (sub.dompe_number && sub.dompe_number.trim()) || String(sub.submission_number ?? "?");

const markerLabel = (sub: { dompe_number?: string | null; submission_number: number | null }) => {
  if (sub.dompe_number) {
    const cleaned = sub.dompe_number.replace(/^dompe\s*/i, "").trim();
    if (cleaned) return cleaned;
  }
  return String(sub.submission_number ?? "?");
};

const getMaterialLabels = (ids: string[]) =>
  ids.map((id) => MATERIAL_TYPES.find((m) => m.id === id)?.label || id).join(", ");

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

const buildPopup = (sub: Submission) => {
  let html = `<div style="font-size:13px;line-height:1.6">
    <div style="font-weight:800;font-size:16px;margin-bottom:6px;color:#1a1a1a">
      #${displayNumber(sub)} — ${sub.name}
    </div>
    <div><b>Type de demande:</b> ${sub.request_type || "—"}</div>
    <div><b>Matériaux:</b> ${getMaterialLabels(sub.materials)}</div>`;
  if (sub.other_material) html += `<div><b>Autre:</b> ${sub.other_material}</div>`;
  if (sub.status) html += `<div><b>Statut:</b> ${sub.status}</div>`;
  html += `<div><b>Type:</b> ${sub.property_type}</div>
    <div><b>Voyages:</b> ${sub.quantity}</div>
    <div><b>Tonnage:</b> ${sub.tonnage}</div>`;
  if (sub.budget_unit) html += `<div><b>Budget:</b> ${sub.budget_max} ${sub.budget_unit}</div>`;
  html += `<div><b>Machinerie:</b> ${sub.machinery_available ? `Oui — ${sub.machinery_description || ""}` : "Non"}</div>`;
  if (sub.accessibility && sub.accessibility.length > 0)
    html += `<div><b>Accessibilité:</b> ${sub.accessibility.join(", ")}</div>`;
  html += `<div><b>Adresse:</b> ${sub.address}${sub.postal_code ? `, ${sub.postal_code}` : ""}</div>
    <div><b>Courriel:</b> ${sub.email}</div>`;
  if (sub.phone) html += `<div><b>Téléphone:</b> ${sub.phone}</div>`;
  if (sub.description) html += `<div><b>Notes:</b> ${sub.description}</div>`;
  if (sub.internal_notes) html += `<div style="margin-top:4px;padding:4px 6px;background:#fff7ed;border-left:3px solid #f97316;border-radius:3px"><b>Notes internes:</b> ${sub.internal_notes}</div>`;
  html += `<div style="margin-top:6px;color:#888;font-size:11px">${formatDate(sub.created_at)}</div></div>`;
  return html;
};

const HIDDEN_STATUSES = ["archivé", "perdu", "terminé"];

interface Props {
  submissions: Submission[];
  onMove?: (id: string, lat: number, lon: number) => void;
  showInactive?: boolean;
}

const AdminMap = ({ submissions, onMove, showInactive = false }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const geoSubs = submissions.filter(
    (s) =>
      s.latitude &&
      s.longitude &&
      s.show_on_admin_map !== false &&
      (showInactive || !HIDDEN_STATUSES.includes((s.status || "").toLowerCase()))
  );

  useEffect(() => {
    if (!containerRef.current || geoSubs.length === 0) return;
    let cancelled = false;

    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !containerRef.current) return;
        if (!mapRef.current) {
          mapRef.current = new g.maps.Map(containerRef.current, {
            center: { lat: 46.8, lng: -71.2 },
            zoom: 7,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
          });
          infoRef.current = new g.maps.InfoWindow();
        }
        // Clear existing markers
        markersRef.current.forEach((m) => m.setMap(null));
        markersRef.current = [];

        const bounds = new g.maps.LatLngBounds();
        geoSubs.forEach((sub) => {
          const color = colorForMaterials(sub.materials, sub.request_type);
          const iconCfg = createNumberIconSvg(markerLabel(sub), color);
          const pos = { lat: sub.latitude!, lng: sub.longitude! };
          const marker = new g.maps.Marker({
            map: mapRef.current!,
            position: pos,
            icon: {
              url: iconCfg.url,
              scaledSize: new g.maps.Size(iconCfg.width, iconCfg.height),
              anchor: new g.maps.Point(iconCfg.width / 2, iconCfg.height / 2),
            },
            draggable: false,
          });
          marker.addListener("click", () => {
            infoRef.current?.setContent(buildPopup(sub));
            infoRef.current?.open({ anchor: marker, map: mapRef.current! });
          });
          if (onMove) {
            // Long-press to enable dragging
            let pressTimer: ReturnType<typeof setTimeout> | null = null;
            marker.addListener("mousedown", () => {
              if (pressTimer) clearTimeout(pressTimer);
              pressTimer = setTimeout(() => marker.setDraggable(true), 1500);
            });
            marker.addListener("mouseup", () => {
              if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
            });
            marker.addListener("dragend", () => {
              const p = marker.getPosition();
              if (p) onMove(sub.id, p.lat(), p.lng());
              marker.setDraggable(false);
            });
          }
          markersRef.current.push(marker);
          bounds.extend(pos);
        });

        if (markersRef.current.length > 0) {
          mapRef.current!.fitBounds(bounds, 50);
          if (markersRef.current.length === 1) {
            mapRef.current!.setZoom(13);
          }
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });

    return () => { cancelled = true; };
  }, [geoSubs.map((s) => `${s.id}:${s.latitude}:${s.longitude}`).join(",")]);

  if (error) {
    return (
      <div className="bg-card rounded-xl border border-border p-8 text-center">
        <p className="text-destructive font-body">Carte indisponible: {error}</p>
      </div>
    );
  }

  if (geoSubs.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-8 text-center">
        <p className="text-muted-foreground font-body">Aucune demande géolocalisée pour le moment.</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden" style={{ boxShadow: "var(--shadow-sm)" }}>
      <div ref={containerRef} style={{ height: "500px", width: "100%" }} />
    </div>
  );
};

export default AdminMap;
