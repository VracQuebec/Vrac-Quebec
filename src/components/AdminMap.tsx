import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MATERIAL_TYPES } from "@/lib/questionnaire-data";

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
}

const createNumberIcon = (num: number) =>
  L.divIcon({
    className: "",
    html: `<div style="
      background: hsl(30, 90%, 50%);
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

const FitBounds = ({ submissions }: { submissions: Submission[] }) => {
  const map = useMap();
  useEffect(() => {
    const points = submissions.filter((s) => s.latitude && s.longitude);
    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map((s) => [s.latitude!, s.longitude!]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  }, [submissions, map]);
  return null;
};

interface Props {
  submissions: Submission[];
}

const AdminMap = ({ submissions }: Props) => {
  const geoSubs = submissions.filter((s) => s.latitude && s.longitude);

  if (geoSubs.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-8 text-center">
        <p className="text-muted-foreground font-body">Aucune demande géolocalisée pour le moment.</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden" style={{ boxShadow: "var(--shadow-sm)" }}>
      <MapContainer
        center={[46.8, -71.2]}
        zoom={7}
        style={{ height: "500px", width: "100%" }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds submissions={geoSubs} />
        {geoSubs.map((sub) => (
          <Marker
            key={sub.id}
            position={[sub.latitude!, sub.longitude!]}
            icon={createNumberIcon(sub.submission_number || 0)}
          >
            <Popup maxWidth={320} minWidth={260}>
              <div style={{ fontFamily: "inherit", fontSize: "13px", lineHeight: 1.6 }}>
                <div style={{ fontWeight: 800, fontSize: "16px", marginBottom: 6, color: "#1a1a1a" }}>
                  #{sub.submission_number} — {sub.name}
                </div>
                <div><b>Matériaux:</b> {getMaterialLabels(sub.materials)}</div>
                {sub.other_material && <div><b>Autre:</b> {sub.other_material}</div>}
                <div><b>Type:</b> {sub.property_type}</div>
                <div><b>Voyages:</b> {sub.quantity}</div>
                <div><b>Tonnage:</b> {sub.tonnage}</div>
                {sub.budget_unit && <div><b>Budget:</b> {sub.budget_max} {sub.budget_unit}</div>}
                <div><b>Machinerie:</b> {sub.machinery_available ? `Oui — ${sub.machinery_description || ""}` : "Non"}</div>
                {sub.accessibility && sub.accessibility.length > 0 && (
                  <div><b>Accessibilité:</b> {sub.accessibility.join(", ")}</div>
                )}
                <div><b>Adresse:</b> {sub.address}{sub.postal_code ? `, ${sub.postal_code}` : ""}</div>
                <div><b>Courriel:</b> {sub.email}</div>
                {sub.phone && <div><b>Téléphone:</b> {sub.phone}</div>}
                {sub.description && <div><b>Notes:</b> {sub.description}</div>}
                <div style={{ marginTop: 6, color: "#888", fontSize: "11px" }}>{formatDate(sub.created_at)}</div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default AdminMap;
