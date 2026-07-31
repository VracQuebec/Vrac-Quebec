// Vrac Québec OS — Portail chauffeur (mobile) : feuille de route et preuve de livraison.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, MapPin, Truck, CheckCircle2, ArrowLeft, PenLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Delivery = {
  id: string; delivery_number: string | null; status: string | null;
  scheduled_date: string | null; scheduled_time: string | null;
  delivery_address: string | null; city: string | null;
  quantity: number | null; quantity_unit: string | null; distance_km: number | null;
  notes: string | null; driver_notes: string | null; signature_name: string | null;
  material: string | null; pickup: string | null; client: string | null;
};
type Portal = { driver: Record<string, unknown> | null; truck: Record<string, unknown> | null; deliveries: Delivery[] };

const STATUS_FLOW: Record<string, { next: string; label: string }> = {
  planifiee: { next: "en_route", label: "Partir vers le chargement" },
  en_route: { next: "chargement", label: "Arrivé au chargement" },
  chargement: { next: "transport", label: "Chargé — en transport" },
  transport: { next: "livraison", label: "Arrivé chez le client" },
};

export default function DriverPortal() {
  const { isReady, user } = useAuthReady();
  const [data, setData] = useState<Portal | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [signature, setSignature] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: res, error } = await supabase.rpc("jsc_driver_portal", { _from: null, _to: null });
    if (error) console.error("driver portal:", error.message);
    setData((res as unknown as Portal) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { if (isReady && user) void load(); else if (isReady) setLoading(false); }, [isReady, user, load]);

  const advance = async (d: Delivery, next: string) => {
    setSaving(true);
    const { error } = await supabase.from("jsc_deliveries").update({ status: next }).eq("id", d.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Statut mis à jour.");
    void load();
  };

  const complete = async (d: Delivery) => {
    if (signature.trim().length < 2) { toast.error("Nom du signataire requis."); return; }
    setSaving(true);
    const { error } = await supabase.from("jsc_deliveries").update({
      status: "livree",
      signature_name: signature.trim().slice(0, 120),
      signature_data: `signed:${new Date().toISOString()}`,
      driver_notes: notes.trim().slice(0, 1000) || null,
      completed_at: new Date().toISOString(),
    }).eq("id", d.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Livraison confirmée.");
    setOpenId(null); setSignature(""); setNotes("");
    void load();
  };

  if (!isReady || loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement de la feuille de route…
    </div>;
  }

  if (!user || !data?.driver) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-xl font-semibold">Portail chauffeur</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Votre compte n'est relié à aucun profil de chauffeur. Contactez votre répartiteur.
        </p>
        <Link to="/" className="text-sm text-primary hover:underline">Retour à l'accueil</Link>
      </div>
    );
  }

  const deliveries = data.deliveries ?? [];

  return (
    <div className="min-h-screen bg-background pb-10">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-2xl px-4 py-5">
          <Link to="/" className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Accueil
          </Link>
          <h1 className="text-xl font-bold">{String(data.driver.name ?? "Chauffeur")}</h1>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Truck className="h-4 w-4" />
            {data.truck ? String(data.truck.name ?? data.truck.plate ?? "Camion assigné") : "Aucun camion assigné"}
            · {deliveries.length} livraison(s)
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-3 px-4 py-5">
        {deliveries.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">Aucune livraison assignée pour le moment.</p>
        )}
        {deliveries.map((d) => {
          const flow = STATUS_FLOW[d.status ?? ""];
          const isOpen = openId === d.id;
          return (
            <Card key={d.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{d.delivery_number ?? "Livraison"}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.scheduled_date ?? "—"} {d.scheduled_time ?? ""} · {d.client ?? "Client"}
                    </p>
                  </div>
                  <Badge variant={d.status === "livree" ? "default" : "secondary"}>{d.status ?? "—"}</Badge>
                </div>

                <div className="space-y-1 text-sm">
                  <p className="flex items-start gap-1.5">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{d.delivery_address ?? "Adresse à confirmer"}{d.city ? `, ${d.city}` : ""}</span>
                  </p>
                  <p className="text-muted-foreground">
                    {d.material ?? "Matériau"} · {d.quantity ?? "—"} {d.quantity_unit ?? ""} · Chargement : {d.pickup ?? "à confirmer"}
                  </p>
                  {d.notes && <p className="text-muted-foreground">Note : {d.notes}</p>}
                </div>

                <div className="flex flex-wrap gap-2">
                  {d.delivery_address && (
                    <Button size="sm" variant="outline" asChild>
                      <a target="_blank" rel="noreferrer"
                        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${d.delivery_address} ${d.city ?? ""}`)}`}>
                        <MapPin className="mr-1.5 h-3.5 w-3.5" /> Itinéraire
                      </a>
                    </Button>
                  )}
                  {flow && (
                    <Button size="sm" disabled={saving} onClick={() => void advance(d, flow.next)}>{flow.label}</Button>
                  )}
                  {d.status === "livraison" && (
                    <Button size="sm" variant="default" onClick={() => setOpenId(isOpen ? null : d.id)}>
                      <PenLine className="mr-1.5 h-3.5 w-3.5" /> Preuve de livraison
                    </Button>
                  )}
                  {d.status === "livree" && (
                    <span className="flex items-center gap-1.5 text-sm text-primary">
                      <CheckCircle2 className="h-4 w-4" /> Livrée — signé par {d.signature_name ?? "client"}
                    </span>
                  )}
                </div>

                {isOpen && (
                  <div className="space-y-3 rounded-lg border p-3">
                    <div>
                      <Label htmlFor={`sig-${d.id}`}>Nom du signataire</Label>
                      <Input id={`sig-${d.id}`} value={signature} maxLength={120}
                        onChange={(e) => setSignature(e.target.value)} placeholder="Personne ayant réceptionné" />
                    </div>
                    <div>
                      <Label htmlFor={`note-${d.id}`}>Notes du chauffeur</Label>
                      <Textarea id={`note-${d.id}`} value={notes} maxLength={1000}
                        onChange={(e) => setNotes(e.target.value)} placeholder="Observations, accès, quantité réelle…" />
                    </div>
                    <Button className="w-full" disabled={saving} onClick={() => void complete(d)}>
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                      Confirmer la livraison
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </main>
    </div>
  );
}
