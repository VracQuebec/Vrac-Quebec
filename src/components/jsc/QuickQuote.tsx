// ============================================================
// CALCULATEUR DE SOUMISSION RAPIDE — interface CRM (admin)
// Ce module ne contient AUCUNE règle de calcul, aucun prix, aucune
// densité et aucun tarif : il appelle le moteur unique Vrac Québec
// (getQuote → quote-engine), exactement comme le parcours public.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { Calculator, Copy, Loader2, Save, Search, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import GooglePlaceAutocomplete from "@/components/GooglePlaceAutocomplete";
import { supabase } from "@/integrations/supabase/client";
import { fetchCatalog, type AssistantMaterial, type AssistantTruck } from "@/lib/jsc/assistant";
import { getQuote, type PublicQuote, type QuoteUnit } from "@/lib/jsc/engine";
import {
  buildQuoteSummary, money, QUICK_QUOTE_DISCLAIMER, QUICK_QUOTE_SOURCES,
  saveQuickQuote, UNIT_LABELS,
} from "@/lib/jsc/quick-quote";

interface LeadHit {
  id: string; name: string | null; email: string | null; phone: string | null; company: string | null;
}

const UNITS: QuoteUnit[] = ["tonne", "m3", "verge"];

export default function QuickQuote() {
  const [materials, setMaterials] = useState<AssistantMaterial[]>([]);
  const [trucks, setTrucks] = useState<AssistantTruck[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [materialId, setMaterialId] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");
  const [unit, setUnit] = useState<QuoteUnit>("tonne");
  const [address, setAddress] = useState("");
  const [truckId, setTruckId] = useState<string>("");

  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<LeadHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [contact, setContact] = useState({ name: "", phone: "", email: "", company: "" });
  const [source, setSource] = useState<string>(QUICK_QUOTE_SOURCES[0]);
  const [notes, setNotes] = useState("");

  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    fetchCatalog()
      .then(({ materials, trucks }) => { setMaterials(materials); setTrucks(trucks ?? []); })
      .catch((e) => setCatalogError(e instanceof Error ? e.message : "Catalogue indisponible."));
  }, []);

  const quantityValue = useMemo(() => {
    const n = Number(String(quantity).replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [quantity]);

  const canCalculate = Boolean(materialId) && quantityValue !== null && address.trim().length > 5;
  const canSave = Boolean(quote) && contact.name.trim().length > 1 &&
    (contact.phone.trim().length > 5 || contact.email.trim().length > 4);

  const runSearch = async () => {
    const term = search.trim();
    if (term.length < 2) return;
    setSearching(true);
    const { data } = await supabase
      .from("submissions")
      .select("id,name,email,phone,company")
      .or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%,company.ilike.%${term}%`)
      .order("created_at", { ascending: false })
      .limit(8);
    setHits((data ?? []) as LeadHit[]);
    setSearching(false);
  };

  const pickLead = (lead: LeadHit) => {
    setSubmissionId(lead.id);
    setContact({
      name: lead.name ?? "", phone: lead.phone ?? "", email: lead.email ?? "", company: lead.company ?? "",
    });
    setHits([]);
    setSearch("");
  };

  const calculate = async () => {
    if (!canCalculate || quantityValue === null) return;
    setQuoting(true); setError(null); setQuote(null); setSaved(null);
    try {
      const res = await getQuote({
        material_id: materialId,
        quantity: quantityValue,
        unit,
        address: address.trim(),
        truck_id: truckId || null,
      });
      setQuote(res.quote.public);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Estimation indisponible.");
    } finally { setQuoting(false); }
  };

  const copySummary = async () => {
    if (!quote || quantityValue === null) return;
    const text = buildQuoteSummary(quote, { quantity: quantityValue, unit, address: address.trim() });
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Résumé copié");
    } catch {
      toast.error("Copie impossible — sélectionnez le texte manuellement.");
    }
  };

  const save = async () => {
    if (!quote || quantityValue === null || !canSave) return;
    setSaving(true);
    try {
      const res = await saveQuickQuote({
        material_id: materialId,
        quantity: quantityValue,
        unit,
        address: address.trim(),
        truck_id: truckId || null,
        source,
        notes: notes.trim() || null,
        submission_id: submissionId,
        contact: {
          name: contact.name.trim(),
          phone: contact.phone.trim() || undefined,
          email: contact.email.trim() || undefined,
          company: contact.company.trim() || undefined,
        },
      });
      setSubmissionId(res.submission_id);
      setSaved(res.request_number);
      toast.success(
        res.lead_created
          ? `Soumission ${res.request_number} enregistrée (nouveau lead)`
          : `Soumission ${res.request_number} rattachée au lead existant`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally { setSaving(false); }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      {/* ---------- Saisie ---------- */}
      <section className="space-y-5 rounded-2xl border border-border bg-card p-4 sm:p-6">
        <header>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Calculator className="h-5 w-5 text-primary" /> Calculateur de soumission rapide
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Matériaux en vrac livrés au client. Même moteur, mêmes prix et mêmes taxes que le calculateur public.
          </p>
        </header>

        {catalogError && <p className="text-sm text-destructive">{catalogError}</p>}

        {/* Client */}
        <div className="space-y-3">
          <Label>Client</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void runSearch(); } }}
              placeholder="Rechercher un client existant (nom, courriel, téléphone)" />
            <Button type="button" variant="outline" onClick={runSearch} disabled={searching}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-2 sm:hidden">Rechercher</span>
            </Button>
          </div>
          {hits.length > 0 && (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {hits.map((h) => (
                <li key={h.id}>
                  <button type="button" onClick={() => pickLead(h)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted">
                    <span className="font-medium text-foreground">{h.name ?? "Sans nom"}</span>
                    <span className="block text-xs text-muted-foreground">
                      {[h.company, h.phone, h.email].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {submissionId && (
            <p className="text-xs text-primary">
              Lead existant sélectionné — la soumission y sera rattachée.{" "}
              <button type="button" className="underline" onClick={() => setSubmissionId(null)}>Détacher</button>
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="qq-name">Nom</Label>
              <Input id="qq-name" value={contact.name}
                onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))} /></div>
            <div><Label htmlFor="qq-company">Entreprise (optionnel)</Label>
              <Input id="qq-company" value={contact.company}
                onChange={(e) => setContact((c) => ({ ...c, company: e.target.value }))} /></div>
            <div><Label htmlFor="qq-phone">Téléphone</Label>
              <Input id="qq-phone" value={contact.phone}
                onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))} /></div>
            <div><Label htmlFor="qq-email">Courriel</Label>
              <Input id="qq-email" type="email" value={contact.email}
                onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))} /></div>
          </div>
        </div>

        {/* Matériau / quantité */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Matériau</Label>
            <Select value={materialId} onValueChange={setMaterialId}>
              <SelectTrigger><SelectValue placeholder="Choisir un matériau" /></SelectTrigger>
              <SelectContent>
                {materials.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="qq-qty">Quantité</Label>
              <Input id="qq-qty" inputMode="decimal" value={quantity}
                onChange={(e) => setQuantity(e.target.value)} placeholder="3" />
            </div>
            <div>
              <Label>Unité</Label>
              <Select value={unit} onValueChange={(v) => setUnit(v as QuoteUnit)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => <SelectItem key={u} value={u}>{UNIT_LABELS[u]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div>
          <Label>Adresse de livraison</Label>
          <GooglePlaceAutocomplete value={address} onChange={setAddress}
            onSelect={(d) => setAddress(d.formattedAddress)}
            placeholder="123 rue Principale, Québec" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Camion</Label>
            <Select value={truckId} onValueChange={setTruckId}>
              <SelectTrigger><SelectValue placeholder="Camion recommandé (automatique)" /></SelectTrigger>
              <SelectContent>
                {trucks.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} — {t.capacity_tonnes} t
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Source de la demande</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {QUICK_QUOTE_SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="qq-notes">Notes internes (optionnel)</Label>
          <Textarea id="qq-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>

        <Button className="w-full" size="lg" onClick={calculate} disabled={!canCalculate || quoting}>
          {quoting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4" />}
          CALCULER
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </section>

      {/* ---------- Résultat ---------- */}
      <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-6">
        <h3 className="text-base font-semibold text-foreground">Résultat</h3>
        {!quote && (
          <p className="text-sm text-muted-foreground">
            Remplissez le formulaire puis cliquez sur « Calculer » pour obtenir le prix.
          </p>
        )}
        {quote && quantityValue !== null && (
          <>
            <dl className="space-y-2 text-sm">
              {([
                ["Matériau", quote.material.name],
                ["Quantité", `${quantityValue} ${UNIT_LABELS[unit]} (${quote.tonnage} t)`],
                ["Adresse de livraison", quote.delivery_address ?? address],
                ["Camion", quote.truck?.name ?? "—"],
                ["Nombre de voyages", String(quote.trips)],
                ["Matériau", money(quote.material_amount)],
                ["Transport", money(quote.transport_amount)],
                ["Sous-total", money(quote.subtotal)],
                ...quote.taxes.map((t) => [`${t.name} (${t.rate_percent} %)`, money(t.amount)] as [string, string]),
              ] as [string, string][]).map(([k, v], i) => (
                <div key={`${k}-${i}`} className="flex items-start justify-between gap-4">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right font-medium text-foreground">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="font-semibold text-foreground">TOTAL ESTIMÉ</span>
              <span className="text-2xl font-bold text-primary">{money(quote.total)}</span>
            </div>
            <p className="flex items-start gap-2 rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
              <Truck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {QUICK_QUOTE_DISCLAIMER}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="outline" onClick={copySummary}>
                <Copy className="mr-2 h-4 w-4" /> COPIER LE RÉSUMÉ
              </Button>
              <Button onClick={save} disabled={!canSave || saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                ENREGISTRER
              </Button>
            </div>
            {!canSave && (
              <p className="text-xs text-muted-foreground">
                Nom et téléphone (ou courriel) requis pour enregistrer la soumission.
              </p>
            )}
            {saved && <p className="text-xs text-primary">Soumission enregistrée : {saved}</p>}
          </>
        )}
      </section>
    </div>
  );
}
