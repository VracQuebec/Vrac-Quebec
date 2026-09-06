// Place de marché publique : vente et achat de vrac, surplus, offres de transport
// et recherche de camion. Publication réservée aux membres connectés.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Loader2, MapPin, Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuthReady } from "@/hooks/useAuthReady";
import { JSC_LISTING_TYPES } from "@/lib/jsc/config";

type Listing = {
  id: string; title: string; listing_type: string; material_label: string | null;
  quantity: number | null; quantity_unit: string | null; price: number | null;
  price_unit: string | null; city: string | null; description: string | null;
  available_from: string | null; created_at: string;
};

const typeLabel = (v: string) => JSC_LISTING_TYPES.find((t) => t.value === v)?.label ?? v;

export default function PlaceDeMarche() {
  const { user } = useAuthReady();
  const [rows, setRows] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "", listing_type: "sell", material_label: "", quantity: "",
    quantity_unit: "tonne", price: "", price_unit: "tonne", city: "", description: "",
    contact_phone: "", contact_email: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("jsc_listings")
      .select("id,title,listing_type,material_label,quantity,quantity_unit,price,price_unit,city,description,available_from,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    setRows((data as unknown as Listing[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const types = useMemo(() => Array.from(new Set(rows.map((r) => r.listing_type))), [rows]);
  const filtered = rows.filter((r) => {
    if (type !== "all" && r.listing_type !== type) return false;
    const s = query.trim().toLowerCase();
    if (!s) return true;
    return [r.title, r.material_label, r.city, r.description].some((v) => String(v ?? "").toLowerCase().includes(s));
  });

  const publish = async () => {
    if (!user) { toast.error("Connectez-vous pour publier une annonce."); return; }
    if (!form.title.trim()) { toast.error("Le titre est obligatoire."); return; }
    setSaving(true);
    const { error } = await supabase.from("jsc_listings").insert({
      created_by: user.id,
      title: form.title.trim(),
      listing_type: form.listing_type,
      material_label: form.material_label.trim() || null,
      quantity: form.quantity ? Number(form.quantity) : null,
      quantity_unit: form.quantity_unit || null,
      price: form.price ? Number(form.price) : null,
      price_unit: form.price_unit || null,
      city: form.city.trim() || null,
      description: form.description.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      contact_email: form.contact_email.trim() || null,
    });
    setSaving(false);
    if (error) { toast.error("La publication a échoué."); return; }
    toast.success("Annonce publiée.");
    setOpen(false);
    setForm({ ...form, title: "", material_label: "", quantity: "", price: "", city: "", description: "" });
    void load();
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <Helmet>
        <title>Place de marché du vrac au Québec | Vrac Québec</title>
        <meta name="description" content="Achetez et vendez du vrac, publiez vos surplus, offrez du transport ou trouvez un camion partout au Québec sur la place de marché Vrac Québec." />
        <link rel="canonical" href="https://vracquebec.ca/place-de-marche" />
        <meta property="og:title" content="Place de marché du vrac au Québec | Vrac Québec" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://vracquebec.ca/place-de-marche" />
      </Helmet>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Place de marché du vrac</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Vendre, acheter, déplacer un surplus, offrir du transport ou trouver un camion :
            tout le marché québécois du vrac dans une seule interface.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild><Link to="/obtenir-des-soumissions">Obtenir des soumissions</Link></Button>
          <Button asChild variant="secondary"><Link to="/reseau">Voir le réseau</Link></Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-1.5 h-4 w-4" /> Publier une annonce</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader><DialogTitle>Publier une annonce</DialogTitle></DialogHeader>
              {!user ? (
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>La publication est réservée aux membres du réseau.</p>
                  <Button asChild className="w-full"><Link to="/login">Se connecter</Link></Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <Label>Titre</Label>
                    <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="20 tonnes de pierre 0-3/4 à Québec" />
                  </div>
                  <div>
                    <Label>Type d'annonce</Label>
                    <Select value={form.listing_type} onValueChange={(v) => setForm({ ...form, listing_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {JSC_LISTING_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Matériau</Label>
                      <Input value={form.material_label} onChange={(e) => setForm({ ...form, material_label: e.target.value })} />
                    </div>
                    <div>
                      <Label>Ville</Label>
                      <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                    </div>
                    <div>
                      <Label>Quantité</Label>
                      <Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                    </div>
                    <div>
                      <Label>Unité</Label>
                      <Input value={form.quantity_unit} onChange={(e) => setForm({ ...form, quantity_unit: e.target.value })} />
                    </div>
                    <div>
                      <Label>Prix</Label>
                      <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                    </div>
                    <div>
                      <Label>Prix par</Label>
                      <Input value={form.price_unit} onChange={(e) => setForm({ ...form, price_unit: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Téléphone</Label>
                      <Input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />
                    </div>
                    <div>
                      <Label>Courriel</Label>
                      <Input value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
                    </div>
                  </div>
                  <Button className="w-full" onClick={publish} disabled={saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Publier
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="mt-6 relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Rechercher une annonce…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Badge variant={type === "all" ? "default" : "outline"} className="cursor-pointer" onClick={() => setType("all")}>Toutes</Badge>
        {types.map((t) => (
          <Badge key={t} variant={type === t ? "default" : "outline"} className="cursor-pointer" onClick={() => setType(t)}>
            {typeLabel(t)}
          </Badge>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement des annonces…
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Aucune annonce active pour l'instant.</p>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((l) => (
            <article key={l.id} className="rounded-xl border bg-card p-5">
              <Badge variant="outline">{typeLabel(l.listing_type)}</Badge>
              <h2 className="mt-2 font-semibold">{l.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {[l.material_label, l.quantity ? `${l.quantity} ${l.quantity_unit ?? "t"}` : null].filter(Boolean).join(" · ")}
              </p>
              {l.description && <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{l.description}</p>}
              <div className="mt-3 flex items-center justify-between text-sm">
                {l.city && <span className="inline-flex items-center gap-1 text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{l.city}</span>}
                {l.price != null && (
                  <span className="font-semibold text-foreground">
                    {l.price.toLocaleString("fr-CA", { style: "currency", currency: "CAD" })}{l.price_unit ? ` / ${l.price_unit}` : ""}
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
