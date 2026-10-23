// Lot 5 — mission du chauffeur. Suivi activé explicitement, uniquement pendant la mission,
// page ouverte (le site ne suit pas un téléphone verrouillé).
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, MapPin, Play, Square } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import PageHeader from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { detectStops, type Point } from "@/lib/ops/stops";

const MIN_INTERVAL_MS = 30000;

export default function DriverMission() {
  const { isReady, user } = useAuthReady();
  const [mission, setMission] = useState<string | null>(null);
  const [f, setF] = useState({ driver: "", truck: "" });
  const [consent, setConsent] = useState(false);
  const [points, setPoints] = useState<Point[]>([]);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);
  const [visible, setVisible] = useState(!document.hidden);
  const [lastPosition, setLastPosition] = useState<{ at: string; accuracy: number } | null>(null);
  const watch = useRef<number | null>(null);
  const last = useRef(0);
  const operation = useRef(false);
  const requestVersion = useRef(0);
  const userId = user?.id;

  const loadActive = useCallback(async () => {
    if (!userId) return;
    const version = ++requestVersion.current;
    setLoading(true); setLoadError(null);
    try {
      const { data, error } = await supabase.from("drv_missions").select("id").eq("user_id", userId).is("ended_at", null).maybeSingle();
      if (version !== requestVersion.current) return;
      if (error) throw new Error(error.message);
      setMission(data?.id ?? null);
      if (data?.id) {
        const { data: pts, error: pointsError } = await supabase.from("drv_points").select("lat,lng,recorded_at").eq("mission_id", data.id).order("recorded_at");
        if (version !== requestVersion.current) return;
        if (pointsError) throw new Error(pointsError.message);
        setPoints(pts ?? []);
      }
    } catch (e) { if (version === requestVersion.current) setLoadError(e instanceof Error ? e.message : "Mission indisponible. Réessayez."); }
    finally { if (version === requestVersion.current) setLoading(false); }
  }, [userId]);
  useEffect(() => {
    setTracking(false); setConsent(false); setMission(null); setPoints([]); setLastPosition(null);
    if (userId) void loadActive();
    return () => {
      requestVersion.current += 1;
      if (watch.current !== null) navigator.geolocation?.clearWatch(watch.current);
      watch.current = null;
    };
  }, [userId, loadActive]);
  useEffect(() => {
    const changed = () => {
      setVisible(!document.hidden);
      // Pas de reprise implicite à la réouverture ou au déverrouillage.
      if (document.hidden) setTracking(false);
    };
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);

  useEffect(() => {
    if (!mission || !userId || !tracking || !visible) return;
    if (!("geolocation" in navigator)) { setGeoError("Localisation indisponible sur cet appareil."); setTracking(false); return; }
    let active = true;
    last.current = 0;
    watch.current = navigator.geolocation.watchPosition(async (pos) => {
      if (!active || document.hidden) return;
      if (Date.now() - last.current < MIN_INTERVAL_MS) return;
      last.current = Date.now();
      const at = new Date(pos.timestamp).toISOString();
      try {
        const { error } = await supabase.rpc("drv_mission_point", { _mission: mission, _lat: pos.coords.latitude, _lng: pos.coords.longitude, _acc: pos.coords.accuracy, _at: at });
        if (!active) return;
        if (error) throw new Error("Position non enregistrée. Vérifiez votre connexion; aucune position n’est conservée hors connexion.");
        setGeoError(null);
        setLastPosition({ at, accuracy: pos.coords.accuracy });
        setPoints((p) => [...p, { lat: pos.coords.latitude, lng: pos.coords.longitude, recorded_at: at }]);
      } catch (e) { if (active) setGeoError(e instanceof Error ? e.message : "Position non enregistrée."); }
    }, (e) => {
      if (!active) return;
      setGeoError(e.code === 1 ? "Localisation refusée : autorisez-la dans les réglages du navigateur." : "Position indisponible pour le moment.");
      if (e.code === 1) setTracking(false);
    },
    { enableHighAccuracy: true, maximumAge: 15000 });
    return () => { active = false; if (watch.current !== null) navigator.geolocation.clearWatch(watch.current); watch.current = null; };
  }, [mission, userId, tracking, visible]);

  const start = async () => {
    if (!consent || operation.current || loading || loadError || !userId) return;
    operation.current = true;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("drv_mission_start", { _sub: null as never, _driver: f.driver, _truck: f.truck, _consent: true });
      if (error) throw new Error(error.message);
      if (typeof data !== "string" || !data) throw new Error("Démarrage non confirmé. Réessayez après relecture de la mission.");
      setMission(data); setPoints([]); setTracking(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Démarrage impossible."); }
    finally { operation.current = false; setBusy(false); }
  };
  const end = async () => {
    if (!mission || operation.current || !userId) return;
    operation.current = true;
    setTracking(false);
    setBusy(true);
    try {
      const { error } = await supabase.rpc("drv_mission_end", { _mission: mission });
      if (error) throw new Error(error.message);
      const check = await supabase.from("drv_missions").select("ended_at").eq("id", mission).eq("user_id", userId).maybeSingle();
      if (check.error || !check.data?.ended_at) throw new Error("Fin de mission non confirmée. Le suivi local est arrêté; réessayez la clôture.");
      setMission(null); setPoints([]); setLastPosition(null); toast.success("Mission terminée : le suivi est arrêté.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Clôture impossible. Le suivi local est arrêté."); }
    finally { operation.current = false; setBusy(false); }
  };

  if (!isReady) return <p className="p-8"><Loader2 className="inline h-4 w-4 animate-spin" /></p>;
  if (!user) return <div className="p-8 text-center"><Button asChild><Link to="/login">Connexion</Link></Button></div>;
  const stops = detectStops(points);

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Ma mission" subtitle="Suivi de position seulement pendant la mission, avec votre accord." />
      <main className="mx-auto max-w-xl space-y-4 px-4 py-5">
        {loading ? <p role="status">Chargement de votre mission…</p> : loadError ? <div role="alert" className="space-y-3"><p>{loadError}</p><Button onClick={() => void loadActive()}>Réessayer</Button></div> : !mission ? (
          <Card><CardContent className="space-y-3 p-4">
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Chauffeur</Label><Input value={f.driver} onChange={(e) => setF({ ...f, driver: e.target.value })} /></div>
              <div><Label>Camion</Label><Input value={f.truck} onChange={(e) => setF({ ...f, truck: e.target.value })} /></div>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={consent} onCheckedChange={(v) => setConsent(!!v)} className="mt-0.5 h-4 w-4 shrink-0 self-start" />
              <span>J'active le suivi de ma position pour cette mission professionnelle seulement. Il s'arrête quand je termine la mission. Mes positions sont visibles par mon entrepreneur et l'équipe Vrac Québec.</span>
            </label>
            <p className="text-xs text-muted-foreground">Suivi seulement avec cette page visible. Après une interruption, reprenez-le explicitement. Utilisez les boutons uniquement à l’arrêt.</p>
            <Button className="h-14 w-full text-lg" disabled={!consent || busy} onClick={() => void start()}><Play className="mr-2 h-5 w-5" />Démarrer la mission</Button>
          </CardContent></Card>
        ) : (
          <Card><CardContent className="space-y-3 p-4">
            <p role="status" className="flex items-center gap-2 font-semibold text-primary"><MapPin className="h-5 w-5" />{tracking && visible ? "Localisation demandée" : "Suivi arrêté"} · {points.length} position(s) enregistrée(s)</p>
            <p className="text-xs text-muted-foreground">Position partagée avec votre entrepreneur et l’équipe Vrac Québec, uniquement pendant cette mission et avec cette page visible. Aucun GPS continu en arrière-plan garanti.</p>
            {lastPosition && <p className="text-sm text-muted-foreground">Dernière position enregistrée : {new Date(lastPosition.at).toLocaleTimeString("fr-CA")} · précision {Math.round(lastPosition.accuracy)} m. Cette position peut être périmée.</p>}
            {geoError && <p className="text-sm text-destructive">{geoError}</p>}
            <Button variant="outline" className="min-h-11 w-full" onClick={() => { setGeoError(null); setTracking((v) => !v); }} disabled={busy}>{tracking ? "Arrêter le suivi" : "Autoriser et reprendre le suivi"}</Button>
            <Button variant="destructive" className="h-14 w-full text-lg" disabled={busy} onClick={() => void end()}><Square className="mr-2 h-5 w-5" />Terminer la mission</Button>
          </CardContent></Card>
        )}
        {stops.length > 0 && (
          <Card><CardContent className="p-4 text-sm">
            <p className="mb-2 font-semibold">Arrêts détectés (à confirmer — ne prouvent pas un déchargement)</p>
            {stops.map((s, i) => <p key={i}>{new Date(s.arrived_at).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })} → {new Date(s.left_at).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })} · {s.minutes} min</p>)}
          </CardContent></Card>
        )}
      </main>
    </div>
  );
}
