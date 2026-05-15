import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MATERIAL_TYPES } from "@/lib/questionnaire-data";
import { colorForMaterials } from "@/lib/material-colors";

interface Submission {
  id: string;
  submission_number: number | null;
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

const createNumberIcon = (num: number, color: string) =>
  L.divIcon({
    className: "",
    html: `<div style="
      background: ${color};
      color: white;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 14px;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    ">${num}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

const getMaterialLabels = (ids: string[]) =>
  ids.map((id) => MATERIAL_TYPES.find((m) => m.id === id)?.label || id).join(", ");

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

const buildPopup = (sub: Submission) => {
  let html = `<div style="font-size:13px;line-height:1.6">
    <div style="font-weight:800;font-size:16px;margin-bottom:6px;color:#1a1a1a">
      #${sub.submission_number} — ${sub.name}
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
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const geoSubs = submissions.filter(
    (s) =>
      s.latitude &&
      s.longitude &&
      s.show_on_admin_map !== false &&
      (showInactive || !HIDDEN_STATUSES.includes((s.status || "").toLowerCase()))
  );

  useEffect(() => {
    if (!containerRef.current || geoSubs.length === 0) return;

    // Clean up previous map
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = L.map(containerRef.current).setView([46.8, -71.2], 7);
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const markers: L.Marker[] = [];
    geoSubs.forEach((sub) => {
      const color = colorForMaterials(sub.materials, sub.request_type);
      const marker = L.marker([sub.latitude!, sub.longitude!], {
        icon: createNumberIcon(sub.submission_number || 0, color),
        draggable: false,
      })
        .bindPopup(buildPopup(sub), { maxWidth: 320, minWidth: 260 })
        .addTo(map);
      if (onMove) {
        let pressTimer: ReturnType<typeof setTimeout> | null = null;
        let armed = false;

        const arm = () => {
          armed = true;
          marker.dragging?.enable();
          const el = marker.getElement();
          if (el) {
            el.style.transform += " scale(1.25)";
            el.style.filter = `drop-shadow(0 0 8px ${color})`;
            el.style.transition = "filter 0.2s";
          }
        };
        const disarm = () => {
          if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
          if (armed) {
            armed = false;
            marker.dragging?.disable();
            const el = marker.getElement();
            if (el) el.style.filter = "";
          }
        };
        const start = () => {
          if (pressTimer) clearTimeout(pressTimer);
          pressTimer = setTimeout(arm, 2000);
        };

        marker.on("mousedown", start);
        marker.on("touchstart", start);
        marker.on("mouseup", () => { if (!armed) disarm(); });
        marker.on("touchend", () => { if (!armed) disarm(); });
        marker.on("mouseout", () => { if (!armed) disarm(); });
        marker.on("dragend", () => {
          const { lat, lng } = marker.getLatLng();
          onMove(sub.id, lat, lng);
          disarm();
        });
      }
      markers.push(marker);
    });

    if (markers.length > 0) {
      const bounds = L.latLngBounds(markers.map((m) => m.getLatLng()));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [geoSubs.map((s) => s.id).join(",")]);

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
