import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import GooglePlaceAutocomplete from "@/components/GooglePlaceAutocomplete";
import { Loader2 } from "lucide-react";
import { sanitizeFilterTerm } from "@/lib/security/filters";

export const LEAD_SOURCES = [
  { value: "vracquebec.ca", label: "Site vracquebec.ca" },
  { value: "google", label: "Google (campagne)" },
  { value: "facebook", label: "Facebook / Instagram" },
  { value: "referencement_naturel", label: "Référencement naturel" },
  { value: "pages_locales", label: "Pages locales" },
  { value: "campagne", label: "Autre campagne" },
  { value: "marketplace", label: "Marketplace Facebook" },
  { value: "messenger", label: "Facebook Messenger" },
  { value: "phone", label: "Téléphone" },
  { value: "sms", label: "SMS" },
  { value: "reference", label: "Référence" },
  { value: "email", label: "Courriel" },
  { value: "website", label: "Site Web" },
  { value: "quebecvrac", label: "QuébecVrac.ca" },
  { value: "vracquebec", label: "Vrac Québec" },
  { value: "transportjsc", label: "Transport JSC" },
  { value: "other", label: "Autre" },
];

export const LEAD_CATEGORIES = [
  { value: "terre", label: "Terre" },
  { value: "remblai", label: "Remblai" },
  { value: "sable", label: "Sable" },
  { value: "gravier", label: "Gravier" },
  { value: "pierre", label: "Pierre" },
  { value: "excavation", label: "Excavation" },
  { value: "terrassement", label: "Terrassement" },
  { value: "transport", label: "Transport" },
  { value: "pneus", label: "Pneus" },
  { value: "mecanique", label: "Mécanique" },
  { value: "immobilier", label: "Immobilier" },
  { value: "autre", label: "Autre" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
}

const inputClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const normPhone = (v: string) => v.replace(/\D/g, "");

const NewLeadModal = ({ open, onClose, onCreated }: Props) => {
  const [saving, setSaving] = useState(false);
  const [dupCheck, setDupCheck] = useState<{ id: string; name: string; phone: string | null; email: string } | null>(null);
  const [forceCreate, setForceCreate] = useState(false);

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("QC");
  const [postalCode, setPostalCode] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [formattedAddress, setFormattedAddress] = useState<string | null>(null);
  const [source, setSource] = useState("phone");
  const [category, setCategory] = useState("terre");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("");
  const [materialDetail, setMaterialDetail] = useState("");
  const [desiredDate, setDesiredDate] = useState("");
  const [budget, setBudget] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  const reset = () => {
    setName(""); setCompany(""); setPhone(""); setEmail("");
    setAddress(""); setCity(""); setProvince("QC"); setPostalCode("");
    setLat(null); setLng(null); setPlaceId(null); setFormattedAddress(null);
    setSource("phone"); setCategory("terre");
    setDescription(""); setQuantity(""); setMaterialDetail("");
    setDesiredDate(""); setBudget(""); setInternalNotes("");
    setDupCheck(null); setForceCreate(false);
  };

  const checkDuplicates = async (): Promise<boolean> => {
    // Les valeurs saisies sont neutralisées avant d'entrer dans un filtre :
    // un texte libre ne doit jamais modifier le sens de la recherche.
    const filters: string[] = [];
    const ph = sanitizeFilterTerm(normPhone(phone), 20);
    const mail = sanitizeFilterTerm(email.trim().toLowerCase(), 160);
    if (ph.length >= 7) filters.push(`phone.ilike.%${ph.slice(-7)}%`);
    if (mail) filters.push(`email.eq.${mail}`);
    if (filters.length === 0) return false;
    const { data } = await supabase
      .from("submissions")
      .select("id,name,phone,email,created_at")
      .or(filters.join(","))
      .order("created_at", { ascending: false })
      .limit(1);
    if (data && data.length > 0) {
      const d = data[0] as any;
      setDupCheck({ id: d.id, name: d.name, phone: d.phone, email: d.email });
      return true;
    }
    return false;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !address.trim()) {
      toast({ title: "Champs requis", description: "Nom et adresse sont obligatoires.", variant: "destructive" });
      return;
    }
    if (!phone.trim() && !email.trim()) {
      toast({ title: "Contact requis", description: "Téléphone ou courriel obligatoire.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      if (!forceCreate && !dupCheck) {
        const hasDup = await checkDuplicates();
        if (hasDup) { setSaving(false); return; }
      }

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;

      // Geocode if needed
      let finalLat = lat, finalLng = lng, finalPlaceId = placeId, finalFormatted = formattedAddress;
      let geoStatus: "validated_address" | "validated_postal" | "approximate" | "error" = "error";
      if (finalLat && finalLng) {
        geoStatus = "validated_address";
      } else if (address.trim()) {
        try {
          const { data: g } = await supabase.functions.invoke("google-geocode", {
            body: { address: `${address}, ${city ? city + ", " : ""}${province} ${postalCode}`.trim() },
          });
          if (g?.lat && g?.lng) {
            finalLat = g.lat; finalLng = g.lng;
            finalPlaceId = g.placeId || null;
            finalFormatted = g.formattedAddress || null;
            geoStatus = (g.status as any) || "approximate";
          }
        } catch { /* keep error */ }
      }

      const payload: any = {
        name: name.trim(),
        company: company.trim() || null,
        phone: phone.trim() || null,
        email: email.trim().toLowerCase() || "manual@vracquebec.ca",
        address: address.trim(),
        city: city.trim() || null,
        province: province.trim() || "QC",
        postal_code: postalCode.trim() || null,
        latitude: finalLat,
        longitude: finalLng,
        place_id: finalPlaceId,
        formatted_address: finalFormatted,
        geocoding_status: geoStatus,
        geocoding_provider: "google",
        // Required NOT NULL fields with sensible defaults for manual leads
        materials: materialDetail.trim() ? [materialDetail.trim()] : [category],
        other_material: materialDetail.trim() || null,
        property_type: "residentiel",
        quantity: quantity.trim() || "",
        tonnage: "",
        request_type: "livraison",
        description: description.trim() || null,
        budget_max: budget.trim() || null,
        internal_notes: internalNotes.trim(),
        status: "nouveau",
        priority: "normal",
        visible_to_entrepreneur: false,
        // Manual lead tracking
        lead_source: source,
        lead_category: category,
        desired_date: desiredDate || null,
        created_by: uid,
        creation_origin: "manual_admin",
      };

      const { data: ins, error } = await supabase
        .from("submissions")
        .insert(payload)
        .select("id")
        .single();

      if (error) throw error;

      toast({ title: "Lead créé", description: `Nouveau lead ajouté au CRM.` });
      onCreated?.(ins!.id);
      reset();
      onClose();
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message || "Impossible de créer le lead.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>➕ Ajouter un Lead</DialogTitle>
          <DialogDescription>
            Créer manuellement un lead (appel, Messenger, SMS, référence…). Traité comme un lead du formulaire.
          </DialogDescription>
        </DialogHeader>

        {dupCheck && !forceCreate ? (
          <div className="space-y-4">
            <div className="p-4 rounded-lg border border-amber-400 bg-amber-50 text-amber-900">
              <p className="font-semibold mb-2">Un lead similaire existe déjà :</p>
              <p className="text-sm">{dupCheck.name} — {dupCheck.phone || dupCheck.email}</p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { onClose(); window.location.hash = `#lead-${dupCheck.id}`; }}>
                Ouvrir la fiche existante
              </Button>
              <Button onClick={() => { setForceCreate(true); setDupCheck(null); }}>
                Créer quand même
              </Button>
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-foreground mb-1">Client</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input placeholder="Nom complet *" value={name} onChange={(e) => setName(e.target.value)} required />
              <Input placeholder="Entreprise (optionnel)" value={company} onChange={(e) => setCompany(e.target.value)} />
              <Input placeholder="Téléphone" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" />
              <Input placeholder="Courriel" value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" />
            </div>
            <GooglePlaceAutocomplete
              value={address}
              onChange={setAddress}
              onSelect={(d) => {
                setAddress(d.formattedAddress);
                setFormattedAddress(d.formattedAddress);
                setPlaceId(d.placeId);
                if (d.postalCode) setPostalCode(d.postalCode);
                if (d.lat) setLat(d.lat);
                if (d.lng) setLng(d.lng);
              }}
              placeholder="Adresse *"
              className={inputClass}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input placeholder="Ville" value={city} onChange={(e) => setCity(e.target.value)} />
              <Input placeholder="Province" value={province} onChange={(e) => setProvince(e.target.value)} />
              <Input placeholder="Code postal" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-foreground mb-1">Source & Catégorie</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select className={inputClass} value={source} onChange={(e) => setSource(e.target.value)}>
                {LEAD_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
                {LEAD_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-foreground mb-1">Projet</legend>
            <textarea
              className={`${inputClass} h-20`}
              placeholder="Description du besoin"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input placeholder="Quantité estimée (ex: 10 tonnes)" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              <Input placeholder="Type de matériel recherché" value={materialDetail} onChange={(e) => setMaterialDetail(e.target.value)} />
              <Input placeholder="Date souhaitée" type="date" value={desiredDate} onChange={(e) => setDesiredDate(e.target.value)} />
              <Input placeholder="Budget (optionnel)" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </div>
            <textarea
              className={`${inputClass} h-16`}
              placeholder="Notes internes"
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
            />
          </fieldset>

          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }} disabled={saving}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Création…</> : "Créer le lead"}
            </Button>
          </div>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default NewLeadModal;