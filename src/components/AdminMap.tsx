import { useEffect, useMemo, useRef, useState } from "react";
import { MATERIAL_TYPES } from "@/lib/questionnaire-data";
import { colorForMaterials } from "@/lib/material-colors";
import { loadGoogleMaps } from "@/lib/google-maps-loader";
import { Crosshair, X, Search, Move } from "lucide-react";
import type { LeadStatus } from "@/hooks/useLeadStatuses";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  availability_status?: string | null;
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

const buildPopup = (sub: Submission, leadStatuses?: LeadStatus[]) => {
  let html = `<div style="font-size:13px;line-height:1.6">
    <div style="font-weight:800;font-size:16px;margin-bottom:6px;color:#1a1a1a">
      #${displayNumber(sub)} — ${sub.name}
    </div>
    <div><b>Type de demande:</b> ${sub.request_type || "—"}</div>
    <div><b>Matériaux:</b> ${getMaterialLabels(sub.materials)}</div>`;
  if (sub.other_material) html += `<div><b>Autre:</b> ${sub.other_material}</div>`;
  if (leadStatuses && leadStatuses.length > 0) {
    const opts = leadStatuses
      .filter((s) => s.enabled || s.value === sub.status)
      .map(
        (s) =>
          `<option value="${s.value}" ${s.value === (sub.status || "") ? "selected" : ""}>${s.label}</option>`
      )
      .join("");
    html += `<div style="margin:4px 0"><b>Statut:</b>
      <select data-lead-status-select="${sub.id}" style="margin-left:6px;padding:2px 4px;border:1px solid #ccc;border-radius:4px;font-size:12px">${opts}</select>
    </div>`;
  } else if (sub.status) {
    html += `<div><b>Statut:</b> ${sub.status}</div>`;
  }
  const availOpts = AVAILABILITY_OPTIONS.map(
    (o) =>
      `<option value="${o.value}" ${o.value === (sub.availability_status || "available") ? "selected" : ""}>${o.label}</option>`,
  ).join("");
  html += `<div style="margin:4px 0"><b>Disponibilité:</b>
    <select data-lead-avail-select="${sub.id}" style="margin-left:6px;padding:2px 4px;border:1px solid #ccc;border-radius:4px;font-size:12px">${availOpts}</select>
  </div>`;
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
  if (sub.internal_notes) html += `<div style="margin-top:4px;padding:4px 6px;background:#f3faea;border-left:3px solid #7ED321;border-radius:3px"><b>Notes internes:</b> ${sub.internal_notes}</div>`;
  html += `<div style="margin-top:6px;color:#888;font-size:11px">${formatDate(sub.created_at)}</div></div>`;
  return html;
};

const HIDDEN_STATUSES = ["archivé", "perdu", "terminé"];

const AVAILABILITY_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: "available", label: "🟢 Disponible", color: "#16a34a" },
  { value: "limited", label: "🟡 Capacité limitée", color: "#ca8a04" },
  { value: "unavailable", label: "🔴 Indisponible", color: "#dc2626" },
];

const availabilityLabel = (v?: string | null) =>
  AVAILABILITY_OPTIONS.find((o) => o.value === (v || "available"))?.label ?? "🟢 Disponible";

const RADIUS_OPTIONS_KM = [1, 2, 5, 10, 15, 20, 25, 50, 100];

const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
};

interface Props {
  submissions: Submission[];
  onMove?: (id: string, lat: number, lon: number) => void;
  showInactive?: boolean;
  leadStatuses?: LeadStatus[];
  onStatusChange?: (id: string, status: string) => void | Promise<void>;
}

const AdminMap = ({ submissions, onMove, showInactive = false, leadStatuses, onStatusChange }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const centerMarkerRef = useRef<google.maps.Marker | null>(null);
  const mapClickListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const suggestionsBoxRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [radiusMode, setRadiusMode] = useState(false);
  const [pickMode, setPickMode] = useState(false);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(10);
  const [searchValue, setSearchValue] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [pendingMove, setPendingMove] = useState<
    { id: string; label: string; lat: number; lng: number; from: { lat: number; lng: number } } | null
  >(null);

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
            gestureHandling: "greedy",
          });
          infoRef.current = new g.maps.InfoWindow();
        }
        // Clear existing markers
        markersRef.current.forEach((m) => m.setMap(null));
        markersRef.current.clear();

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
            draggable: Boolean(onMove) && editMode,
            cursor: Boolean(onMove) && editMode ? "move" : "pointer",
          });
          marker.addListener("click", () => {
            infoRef.current?.setContent(buildPopup(sub, leadStatuses));
            infoRef.current?.open({ anchor: marker, map: mapRef.current! });
          });
          if (onMove) {
            marker.addListener("dragend", () => {
              const p = marker.getPosition();
              if (!p) return;
              setPendingMove({
                id: sub.id,
                label: displayNumber(sub),
                lat: p.lat(),
                lng: p.lng(),
                from: pos,
              });
            });
          }
          markersRef.current.set(sub.id, marker);
          bounds.extend(pos);
        });

        if (markersRef.current.size > 0 && !center) {
          mapRef.current!.fitBounds(bounds, 50);
          if (markersRef.current.size === 1) {
            mapRef.current!.setZoom(13);
          }
        }

        // Attach status-change handler each time the InfoWindow renders.
        if (infoRef.current && !(infoRef.current as any).__statusListenerAttached) {
          infoRef.current.addListener("domready", () => {
            const el = document.querySelector<HTMLSelectElement>("select[data-lead-status-select]");
            if (el) {
              el.onchange = () => {
                const id = el.getAttribute("data-lead-status-select");
                if (id && onStatusChange) onStatusChange(id, el.value);
              };
            }
            const availEl = document.querySelector<HTMLSelectElement>("select[data-lead-avail-select]");
            if (availEl) {
              availEl.onchange = async () => {
                const id = availEl.getAttribute("data-lead-avail-select");
                if (!id) return;
                const { error } = await supabase
                  .from("submissions")
                  .update({ availability_status: availEl.value })
                  .eq("id", id);
                if (error) {
                  toast({ title: "Erreur", description: error.message, variant: "destructive" });
                } else {
                  toast({ title: "Disponibilité mise à jour", description: availabilityLabel(availEl.value) });
                }
              };
            }
          });
          (infoRef.current as any).__statusListenerAttached = true;
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });

    return () => { cancelled = true; };
  }, [geoSubs.map((s) => `${s.id}:${s.latitude}:${s.longitude}:${s.status || ""}:${s.availability_status || ""}`).join(","), leadStatuses?.map((s) => s.value).join(",")]);

  // Distances + in-radius set
  const results = useMemo(() => {
    if (!center) return [] as Array<{ sub: Submission; distance: number }>;
    return geoSubs
      .map((sub) => ({
        sub,
        distance: haversineKm(center, { lat: sub.latitude!, lng: sub.longitude! }),
      }))
      .filter((r) => r.distance <= radiusKm)
      .sort((a, b) => a.distance - b.distance);
  }, [center, radiusKm, geoSubs]);

  const inRadiusIds = useMemo(() => new Set(results.map((r) => r.sub.id)), [results]);

  // Update marker opacity based on radius selection
  useEffect(() => {
    if (!mapRef.current) return;
    markersRef.current.forEach((m, id) => {
      if (!center) {
        m.setOpacity(1);
      } else {
        m.setOpacity(inRadiusIds.has(id) ? 1 : 0.25);
      }
    });
  }, [center, inRadiusIds]);

  // Manage circle + center marker
  useEffect(() => {
    const g = (window as any).google;
    if (!g?.maps || !mapRef.current) return;

    if (!center) {
      circleRef.current?.setMap(null); circleRef.current = null;
      centerMarkerRef.current?.setMap(null); centerMarkerRef.current = null;
      return;
    }

    if (!circleRef.current) {
      circleRef.current = new g.maps.Circle({
        map: mapRef.current,
        center,
        radius: radiusKm * 1000,
        editable: true,
        draggable: true,
        fillColor: "#3b82f6",
        fillOpacity: 0.12,
        strokeColor: "#2563eb",
        strokeOpacity: 0.8,
        strokeWeight: 2,
        clickable: false,
      });
      circleRef.current.addListener("radius_changed", () => {
        const r = circleRef.current?.getRadius();
        if (r) {
          const km = Math.max(0.1, Math.round((r / 1000) * 10) / 10);
          setRadiusKm(km);
        }
      });
      circleRef.current.addListener("center_changed", () => {
        const c = circleRef.current?.getCenter();
        if (c) setCenter({ lat: c.lat(), lng: c.lng() });
      });
    } else {
      circleRef.current.setCenter(center);
      circleRef.current.setRadius(radiusKm * 1000);
    }

    if (!centerMarkerRef.current) {
      centerMarkerRef.current = new g.maps.Marker({
        map: mapRef.current,
        position: center,
        icon: {
          path: g.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: "#2563eb",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
        zIndex: 9999,
      });
    } else {
      centerMarkerRef.current.setPosition(center);
    }
  }, [center, radiusKm]);

  // Map click to pick center
  useEffect(() => {
    if (!mapRef.current) return;
    mapClickListenerRef.current?.remove();
    mapClickListenerRef.current = null;
    if (!pickMode) {
      if (containerRef.current) containerRef.current.style.cursor = "";
      return;
    }
    if (containerRef.current) containerRef.current.style.cursor = "crosshair";
    mapClickListenerRef.current = mapRef.current.addListener("click", (ev: google.maps.MapMouseEvent) => {
      if (!ev.latLng) return;
      setCenter({ lat: ev.latLng.lat(), lng: ev.latLng.lng() });
      setPickMode(false);
    });
    return () => {
      mapClickListenerRef.current?.remove();
      mapClickListenerRef.current = null;
      if (containerRef.current) containerRef.current.style.cursor = "";
    };
  }, [pickMode]);

  // Places autocomplete
  const fetchSuggestions = async (input: string) => {
    if (!suggestionsBoxRef.current) return;
    if (!input || input.length < 3) {
      suggestionsBoxRef.current.innerHTML = "";
      return;
    }
    try {
      const g = (window as any).google;
      if (!g?.maps?.importLibrary) return;
      const places = (await g.maps.importLibrary("places")) as google.maps.PlacesLibrary;
      if (!sessionTokenRef.current) sessionTokenRef.current = new places.AutocompleteSessionToken();
      const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        sessionToken: sessionTokenRef.current,
        includedRegionCodes: ["ca"],
        language: "fr",
      });
      const box = suggestionsBoxRef.current;
      box.innerHTML = "";
      suggestions.slice(0, 5).forEach((s) => {
        const pp = s.placePrediction;
        if (!pp) return;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className =
          "w-full text-left px-3 py-2 text-sm hover:bg-muted focus:bg-muted focus:outline-none border-b border-border last:border-b-0";
        btn.textContent = pp.text?.toString() || "";
        btn.onclick = async (e) => {
          e.preventDefault();
          const place = pp.toPlace();
          await place.fetchFields({ fields: ["formattedAddress", "location"] });
          const loc = place.location;
          if (loc) {
            setCenter({ lat: loc.lat(), lng: loc.lng() });
            setSearchValue(place.formattedAddress || pp.text?.toString() || "");
            mapRef.current?.panTo({ lat: loc.lat(), lng: loc.lng() });
          }
          box.innerHTML = "";
          sessionTokenRef.current = new places.AutocompleteSessionToken();
        };
        box.appendChild(btn);
      });
    } catch { /* ignore */ }
  };

  const focusResult = (sub: Submission) => {
    if (!mapRef.current) return;
    mapRef.current.panTo({ lat: sub.latitude!, lng: sub.longitude! });
    mapRef.current.setZoom(Math.max(mapRef.current.getZoom() ?? 12, 13));
    const marker = markersRef.current.get(sub.id);
    if (marker && infoRef.current) {
      infoRef.current.setContent(buildPopup(sub, leadStatuses));
      infoRef.current.open({ anchor: marker, map: mapRef.current });
    }
  };

  const clearRadius = () => {
    setCenter(null);
    setPickMode(false);
    setSearchValue("");
    if (suggestionsBoxRef.current) suggestionsBoxRef.current.innerHTML = "";
  };

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
    <div className="space-y-3">
      <div className="bg-card rounded-xl border border-border p-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (radiusMode) { clearRadius(); setRadiusMode(false); }
            else { setRadiusMode(true); setPickMode(true); }
          }}
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
            radiusMode
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card border-border hover:bg-muted"
          }`}
        >
          <Crosshair className="w-4 h-4" />
          {radiusMode ? "Désactiver la recherche par rayon" : "Recherche par rayon"}
        </button>

        {radiusMode && (
          <>
            <button
              type="button"
              onClick={() => setPickMode((v) => !v)}
              className={`px-3 py-2 rounded-lg text-sm border ${
                pickMode ? "bg-blue-600 text-white border-blue-600" : "bg-card border-border hover:bg-muted"
              }`}
              title="Cliquer sur la carte pour choisir le point"
            >
              {pickMode ? "Cliquez sur la carte…" : "Choisir un point sur la carte"}
            </button>

            <div className="relative flex-1 min-w-[220px]">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchValue}
                  onChange={(e) => { setSearchValue(e.target.value); fetchSuggestions(e.target.value); }}
                  placeholder="Adresse, ville ou code postal"
                  className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-border bg-background"
                  autoComplete="off"
                />
              </div>
              <div
                ref={suggestionsBoxRef}
                className="absolute z-50 left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg overflow-hidden empty:hidden"
              />
            </div>

            <label className="inline-flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Rayon:</span>
              <select
                value={RADIUS_OPTIONS_KM.includes(radiusKm) ? radiusKm : ""}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
                className="px-2 py-2 rounded-lg border border-border bg-card text-sm"
              >
                {!RADIUS_OPTIONS_KM.includes(radiusKm) && (
                  <option value="">{radiusKm} km</option>
                )}
                {RADIUS_OPTIONS_KM.map((r) => (
                  <option key={r} value={r}>{r} km</option>
                ))}
              </select>
            </label>

            {center && (
              <span className="text-xs text-muted-foreground">
                {results.length} dompe(s) dans le rayon
              </span>
            )}

            {center && (
              <button
                type="button"
                onClick={clearRadius}
                className="inline-flex items-center gap-1 px-2 py-2 rounded-lg text-sm border border-border hover:bg-muted"
                title="Effacer"
              >
                <X className="w-4 h-4" /> Effacer
              </button>
            )}
          </>
        )}
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden" style={{ boxShadow: "var(--shadow-sm)" }}>
        <div ref={containerRef} style={{ height: "500px", width: "100%" }} />
      </div>

      {radiusMode && center && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-2 border-b border-border bg-muted/40 text-sm font-medium">
            Résultats — triés par distance
          </div>
          {results.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Aucune dompe dans ce rayon.</div>
          ) : (
            <div className="max-h-80 overflow-auto divide-y divide-border">
              {results.map(({ sub, distance }) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => focusResult(sub)}
                  className="w-full text-left px-4 py-2 hover:bg-muted transition-colors text-sm grid grid-cols-12 gap-2 items-center"
                >
                  <span className="col-span-2 font-semibold">#{displayNumber(sub)}</span>
                  <span className="col-span-2 text-primary font-medium">{distance.toFixed(1)} km</span>
                  <span className="col-span-3 truncate">{getMaterialLabels(sub.materials) || "—"}</span>
                  <span className="col-span-1 text-muted-foreground">{sub.quantity || "—"}</span>
                  <span className="col-span-2 truncate text-muted-foreground">
                    {(sub.accessibility && sub.accessibility.join(", ")) || "—"}
                  </span>
                  <span className="col-span-1 truncate text-muted-foreground">{sub.postal_code?.slice(0, 3) || "—"}</span>
                  <span className="col-span-1 truncate text-xs">{sub.status || "—"}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminMap;
