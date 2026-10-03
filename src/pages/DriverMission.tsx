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
  const watch = useRef<number | null>(null);
  const last = useRef(0);

  const loadActive = useCallback(async () => {
    const { data } = await supabase.from("drv_missions").select("id").eq("user_id", user!.id).is("ended_at", null).maybeSingle();
    setMission(data?.id ?? null);
    if (data?.id) {
      const { data: pts } = await supabase.from("drv_points").select("lat,lng,recorded_at").eq("mission_id", data.id).order("recorded_at");
      setPoints(pts ?? []);
    }
  }, [user]);
  useEffect(() => { if (user) void loadActive(); }, [user, loadActive]);

  useEffect(() => {
    if (!mission || !("geolocation" in navigator)) return;
    watch.current = navigator.geolocation.watchPosition(async (pos) => {
      setGeoError(null);
      if (Date.now() - last.current < MIN_INTERVAL_MS) return;
      last.current = Date.now();
      const at = new Date(pos.timestamp).toISOString();
      const { error } = await supabase.rpc("drv_mission_point", { _mission: mission, _lat: pos.coords.latitude, _lng: pos.coords.longitude, _acc: pos.coords.accuracy, _at: at });
      if (!error) setPoints((p) => [...p, { lat: pos.coords.latitude, lng: pos.coords.longitude, recorded_at: at }]);
    }, (e) => setGeoError(e.code === 1 ? "Localisation refusée : autorisez-la dans les réglages du navigateur." : "Position indisponible pour le moment."),
    { enableHighAccuracy: true, maximumAge: 15000 });
    return () => { if (watch.current !== null) navigator.geolocation.clearWatch(watch.current); };
  }, [mission]);

  const start = async () => {
    if (!consent || busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("drv_mission_start", { _sub: undefined, _driver: f.driver, _truck: f.truck, _consent: true });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setMission(data as string); setPoints([]);
  };
  const end = async () => {
    if (!mission) return;
    setBusy(true);
    await supabase.rpc("drv_mission_end", { _mission: mission });
    setBusy(false); setMission(null); toast.success("Mission terminée : le suivi est arrêté.");
  };

  if (!isReady) return <p className="p-8"><Loader2 className="inline h-4 w-4 animate-spin" /></p>;
  if (!user) return <div className="p-8 text-center"><Button asChild><Link to="/login">Connexion</Link></Button></div>;
  const stops = detectStops(points);

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Ma mission" subtitle="Suivi de position seulement pendant la mission, avec votre accord." />
      <main className="mx-auto max-w-xl space-y-4 px-4 py-5">
        {!mission ? (
          <Card><CardContent className="space-y-3 p-4">
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Chauffeur</Label><Input value={f.driver} onChange={(e) => setF({ ...f, driver: e.target.value })} /></div>
              <div><Label>Camion</Label><Input value={f.truck} onChange={(e) => setF({ ...f, truck: e.target.value })} /></div>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={consent} onCheckedChange={(v) => setConsent(!!v)} className="mt-0.5" />
              <span>J'active le suivi de ma position pour cette mission professionnelle seulement. Il s'arrête quand je termine la mission. Mes positions sont visibles par mon entrepreneur et l'équipe Vrac Québec.</span>
            </label>
            <p className="text-xs text-muted-foreground">Gardez cette page ouverte : le suivi s'interrompt si le téléphone est verrouillé.</p>
            <Button className="h-14 w-full text-lg" disabled={!consent || busy} onClick={() => void start()}><Play className="mr-2 h-5 w-5" />Démarrer la mission</Button>
          </CardContent></Card>
        ) : (
          <Card><CardContent className="space-y-3 p-4">
            <p className="flex items-center gap-2 font-semibold text-primary"><MapPin className="h-5 w-5 animate-pulse" />Suivi actif · {points.length} position(s)</p>
            {geoError && <p className="text-sm text-destructive">{geoError}</p>}
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
