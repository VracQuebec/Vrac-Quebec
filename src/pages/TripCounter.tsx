// Lot 2 — compteur numérique relié aux coupons.
// ?cote=recu (client, par défaut) ou ?cote=livre (entrepreneur). Les deux côtés ne s'additionnent jamais.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Camera, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import PageHeader from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ServiceOffers from "@/components/ops/ServiceOffers";
import { summarize, type Trip } from "@/lib/ops/trips";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const LS = (id: string) => `cpn.counter.${id}`;

export default function TripCounter() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const side = params.get("cote") === "livre" ? "livre" : "recu";
  const { isReady, user } = useAuthReady();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const saved = (() => { try { return JSON.parse(localStorage.getItem(LS(id)) ?? "{}"); } catch { return {}; } })();
  const [f, setF] = useState({ ent: saved.ent ?? "", driver: saved.driver ?? "", truck: saved.truck ?? "", dest: saved.dest ?? "", coupon: "", total: "", date: today() });
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [photo, setPhoto] = useState<File | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("cpn_trips").select("*").eq("submission_id", id).order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setTrips((data as Trip[]) ?? []); setLoading(false);
  }, [id]);
  useEffect(() => { if (isReady && user) void load(); else if (isReady) setLoading(false); }, [isReady, user, load]);
  useEffect(() => { localStorage.setItem(LS(id), JSON.stringify({ ent: f.ent, driver: f.driver, truck: f.truck, dest: f.dest })); }, [id, f.ent, f.driver, f.truck, f.dest]);

  const s = useMemo(() => summarize(trips), [trips]);
  const todayCount = s.groups.filter((g) => g.date === today()).reduce((n, g) => n + ((side === "recu" ? g.recu : g.livre) ?? 0), 0);

  const add = async (kind: "voyage" | "total_jour") => {
    if (busy) return;
    if (!f.ent.trim()) { toast.error("Indiquez l'entrepreneur (chaque entrepreneur a son propre décompte)."); return; }
    if (kind === "total_jour" && !(Number(f.total) >= 0 && f.total !== "")) { toast.error("Total du jour requis."); return; }
    setBusy(true);
    let path: string | undefined;
    if (photo) {
      path = `${id}/${key}.${photo.name.split(".").pop() || "jpg"}`;
      const up = await supabase.storage.from("cpn-photos").upload(path, photo, { upsert: false });
      if (up.error && !up.error.message.includes("exists")) { setBusy(false); toast.error(`Photo non envoyée : ${up.error.message}`); return; }
    }
    const { error } = await supabase.rpc("cpn_trip_add", {
      _sub: id, _side: side, _kind: kind, _date: kind === "voyage" ? today() : f.date, _count: Number(f.total || 1),
      _ent_label: f.ent, _driver: f.driver, _truck: f.truck, _destination: f.dest,
      _coupon: f.coupon ? Number(f.coupon) : undefined, _photo: path, _key: key,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(kind === "voyage" ? "Voyage ajouté." : "Total du jour enregistré.");
    setKey(crypto.randomUUID()); setPhoto(null); setF({ ...f, coupon: "", total: "" });
    void load();
  };

  const voidTrip = async (t: Trip) => {
    const reason = window.prompt("Motif de l'annulation (erreur de saisie…)");
    if (!reason) return;
    const { error } = await supabase.rpc("cpn_trip_void", { _id: t.id, _reason: reason });
    if (error) toast.error(error.message); else void load();
  };

  if (!isReady || loading) return <p className="p-8 text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" /> Chargement…</p>;
  if (!user) return <div className="p-8 text-center"><p className="mb-3">Connectez-vous pour compter vos voyages.</p><Button asChild><Link to="/login">Connexion</Link></Button></div>;

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title={side === "recu" ? "Voyages reçus" : "Voyages livrés"} subtitle="Le coupon papier et l'application vérifient la même activité : 10 + 10 = 10 voyages." />
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Entrepreneur</Label><Input value={f.ent} onChange={(e) => setF({ ...f, ent: e.target.value })} placeholder="Nom de l'entreprise" /></div>
              <div><Label>Chauffeur</Label><Input value={f.driver} onChange={(e) => setF({ ...f, driver: e.target.value })} /></div>
              <div><Label>Camion</Label><Input value={f.truck} onChange={(e) => setF({ ...f, truck: e.target.value })} placeholder="N° ou plaque" /></div>
              {side === "livre"
                ? <div><Label>Destination</Label><Input value={f.dest} onChange={(e) => setF({ ...f, dest: e.target.value })} /></div>
                : <div><Label>N° de coupon</Label><Input inputMode="numeric" value={f.coupon} onChange={(e) => setF({ ...f, coupon: e.target.value.replace(/\D/g, "") })} /></div>}
            </div>
            <Button className="h-20 w-full font-display text-xl font-extrabold" disabled={busy} onClick={() => void add("voyage")}>
              {busy ? <Loader2 className="mr-2 h-6 w-6 animate-spin" /> : <Plus className="mr-2 h-6 w-6" />}
              {side === "recu" ? "Ajouter un voyage reçu" : "Ajouter un voyage livré"}
            </Button>
            <p className="text-center text-sm">Aujourd'hui : <b className="text-lg">{todayCount}</b> voyage(s)</p>
            <div className="flex flex-wrap items-end gap-2 border-t pt-3">
              <div><Label>Ou total d'une journée</Label><Input type="date" max={today()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
              <div className="w-24"><Label>Voyages</Label><Input inputMode="numeric" value={f.total} onChange={(e) => setF({ ...f, total: e.target.value.replace(/\D/g, "") })} /></div>
              <Button variant="outline" disabled={busy} onClick={() => void add("total_jour")}>Enregistrer le total</Button>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-primary">
              <Camera className="h-4 w-4" /> {photo ? photo.name : "Joindre la photo du coupon (envoyée avec la prochaine saisie)"}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Décompte · {s.total} voyage(s) confirmé(s){s.pending ? ` · ${s.pending} écart(s) à régler` : ""}</CardTitle></CardHeader>
          <CardContent className="divide-y p-0">
            {s.groups.length === 0 && <p className="p-4 text-sm text-muted-foreground">Aucun voyage pour l'instant.</p>}
            {s.groups.map((g) => (
              <div key={g.date + g.entrepreneur} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold">{g.date} · {g.entrepreneur}</p>
                  <p className="text-xs text-muted-foreground">{[g.drivers.join(", "), g.trucks.join(", ")].filter(Boolean).join(" · ") || "Chauffeur/camion non précisés"}{g.photos ? ` · ${g.photos} photo(s)` : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs">Reçus {g.recu ?? "—"} · Livrés {g.livre ?? "—"}</span>
                  {g.agreed === null ? <Badge variant="destructive">Écart {g.gap > 0 ? "+" : ""}{g.gap}</Badge> : <Badge>{g.agreed}</Badge>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Mes saisies</CardTitle></CardHeader>
          <CardContent className="max-h-72 divide-y overflow-y-auto p-0 text-xs">
            {trips.filter((t) => t.side === side).map((t) => (
              <div key={t.id} className={`flex items-center justify-between gap-2 px-4 py-1.5 ${t.voided_at ? "line-through opacity-50" : ""}`}>
                <span>{t.trip_date} · {t.kind === "voyage" ? `1 voyage${t.occurred_at ? ` à ${new Date(t.occurred_at).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}` : ""}` : `total du jour : ${t.count}`} · {t.entrepreneur_label}</span>
                {!t.voided_at && t.created_at && <button className="text-destructive" onClick={() => void voidTrip(t)}>Annuler</button>}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Besoin d'autre chose sur le chantier ?</CardTitle></CardHeader>
          <CardContent><ServiceOffers submissionId={id} kinds={side === "recu" ? ["pepine", "finition", "materiaux", "analyse_sol"] : ["pepine", "camion_10", "camion_12"]} /></CardContent>
        </Card>
      </main>
    </div>
  );
}
