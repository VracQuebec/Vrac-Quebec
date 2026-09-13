// ============================================================
// FICHE CRM — RELECTURE COMPLÈTE D'UNE DEMANDE DE PARCOURS
// ------------------------------------------------------------
// Lecture seule : affiche, section par section, TOUT ce que le
// formulaire public (/remblai et /depot-materiaux) a recueilli.
// Compatible avec les anciennes demandes (champs texte).
// ============================================================
import { MapPin, Truck, Camera, Ruler, CalendarDays, ShieldCheck, User, Hammer } from "lucide-react";
import {
  directionLabel,
  formatQuantity,
  heavyTruckAccessLabel,
  parseLegacyQuantity,
  photoCategoryLabel,
  readAccessCriteria,
  readPhotos,
  accessCriterionLabel,
  PHOTO_CATEGORY_DEFS,
} from "@/lib/parcours/normalisation";
import { truckTypeLabel } from "@/lib/trucks/catalog";

export interface ParcoursLead {
  id: string;
  submission_number?: number | null;
  created_at?: string | null;
  name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  formatted_address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  province?: string | null;
  property_type?: string | null;
  materials?: string[] | null;
  other_material?: string | null;
  quantity?: string | null;
  quantity_value?: number | string | null;
  quantity_unit?: string | null;
  parcours_direction?: string | null;
  service_type?: string | null;
  deliver_or_remove?: string | null;
  truck_type_key?: string | null;
  truck_types_allowed?: string[] | null;
  access_heavy_truck?: string | null;
  access_criteria?: string[] | null;
  access_details?: Record<string, unknown> | null;
  photos?: string[] | null;
  photos_meta?: unknown;
  desired_date?: string | null;
  delivery_timeframe?: string | null;
  delivery_deadline?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geocoding_status?: string | null;
  geocoding_provider?: string | null;
  place_id?: string | null;
  location_type?: string | null;
  lead_source?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  landing_referrer?: string | null;
  description?: string | null;
}

const NA = "Non renseigné";
const txt = (v: unknown): string => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : NA);

function Section({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-3">
      <h4 className="mb-2 inline-flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {title}
      </h4>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-display font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="break-words font-body text-xs text-foreground">{value || NA}</div>
    </div>
  );
}

const Grid = ({ children }: { children: React.ReactNode }) => (
  <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
);

export default function LeadParcoursPanel({ lead }: { lead: ParcoursLead }) {
  const legacy = parseLegacyQuantity(lead.quantity);
  const qtyValue = lead.quantity_value ?? legacy.value;
  const qtyUnit = lead.quantity_unit ?? legacy.unit;
  const quantity = formatQuantity(qtyValue, qtyUnit);

  const direction = lead.parcours_direction
    ?? (lead.service_type === "remblai_disposition" ? "evacuation"
      : lead.service_type === "materiel_remplissage" ? "reception" : null);

  const criteria = readAccessCriteria(lead);
  const photos = readPhotos(lead);
  const trucks = lead.truck_type_key
    ? [lead.truck_type_key]
    : (lead.truck_types_allowed ?? []);

  const mapsUrl = lead.latitude != null && lead.longitude != null
    ? `https://www.google.com/maps/search/?api=1&query=${lead.latitude},${lead.longitude}`
    : lead.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.address)}`
      : null;

  return (
    <div className="grid gap-3">
      <Section title="Client" icon={User}>
        <Grid>
          <Row label="Nom" value={txt(lead.name)} />
          <Row label="Entreprise" value={txt(lead.company)} />
          <Row label="Téléphone" value={lead.phone ? <a className="underline" href={`tel:${lead.phone}`}>{lead.phone}</a> : NA} />
          <Row label="Courriel" value={lead.email ? <a className="underline break-all" href={`mailto:${lead.email}`}>{lead.email}</a> : NA} />
        </Grid>
      </Section>

      <Section title="Chantier" icon={Hammer}>
        <Grid>
          <Row label="Adresse saisie" value={txt(lead.address)} />
          <Row label="Adresse validée (Google)" value={txt(lead.formatted_address)} />
          <Row label="Ville" value={txt(lead.city)} />
          <Row label="Code postal" value={txt(lead.postal_code)} />
          <Row label="Type de projet" value={txt(lead.property_type)} />
          <Row label="Direction de la demande" value={directionLabel(direction)} />
        </Grid>
      </Section>

      <Section title="Matériau" icon={Ruler}>
        <Grid>
          <Row label="Matériaux sélectionnés" value={(lead.materials ?? []).join(", ") || NA} />
          <Row label="Précision" value={txt(lead.other_material)} />
        </Grid>
      </Section>

      <Section title="Quantité" icon={Ruler}>
        <Grid>
          <Row label="Quantité" value={quantity} />
          <Row label="Valeur" value={qtyValue != null ? String(qtyValue) : NA} />
          <Row label="Unité" value={qtyUnit ?? NA} />
          <Row label="Saisie d'origine" value={txt(lead.quantity)} />
        </Grid>
      </Section>

      <Section title="Transport / camions" icon={Truck}>
        <Grid>
          <Row label="Type de camion demandé" value={trucks.length ? trucks.map((t) => truckTypeLabel(t)).join(", ") : NA} />
          <Row label="Clés internes" value={trucks.join(", ") || NA} />
          <Row label="Accès camion lourd" value={heavyTruckAccessLabel(lead.access_heavy_truck)} />
        </Grid>
      </Section>

      <Section title="Accessibilité" icon={ShieldCheck}>
        {criteria.length === 0 ? (
          <p className="font-body text-xs text-muted-foreground">Aucun critère d'accès recueilli.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {criteria.map((k) => (
              <li key={k} className="rounded-full border border-border bg-secondary/50 px-2 py-1 font-body text-[11px]">
                {accessCriterionLabel(k)}
              </li>
            ))}
          </ul>
        )}
        {typeof lead.access_details?.autre === "string" && (
          <p className="mt-2 font-body text-xs text-muted-foreground">Autre : {lead.access_details.autre as string}</p>
        )}
      </Section>

      <Section title="Photos" icon={Camera}>
        {photos.length === 0 ? (
          <p className="font-body text-xs text-muted-foreground">Aucune photo transmise.</p>
        ) : (
          PHOTO_CATEGORY_DEFS.map((cat) => {
            const list = photos.filter((p) => p.category === cat.key);
            if (!list.length) return null;
            return (
              <div key={cat.key} className="mb-3 last:mb-0">
                <div className="mb-1 text-[10px] font-display font-bold uppercase tracking-wide text-muted-foreground">
                  {cat.label} ({list.length})
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {list.map((p) => (
                    <a key={p.url} href={p.url} target="_blank" rel="noopener noreferrer" className="block">
                      <img src={p.url} alt={`Photo — ${photoCategoryLabel(p.category)}`} loading="lazy"
                        className="h-20 w-full rounded object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </Section>

      <Section title="Date / délai" icon={CalendarDays}>
        <Grid>
          <Row label="Date souhaitée" value={txt(lead.desired_date)} />
          <Row label="Délai" value={txt(lead.delivery_timeframe)} />
          <Row label="Date limite" value={txt(lead.delivery_deadline)} />
          <Row label="Demande reçue le" value={lead.created_at ? new Date(lead.created_at).toLocaleString("fr-CA") : NA} />
        </Grid>
      </Section>

      <Section title="Géolocalisation" icon={MapPin}>
        <Grid>
          <Row label="Latitude" value={lead.latitude != null ? String(lead.latitude) : NA} />
          <Row label="Longitude" value={lead.longitude != null ? String(lead.longitude) : NA} />
          <Row label="Statut du géocodage" value={txt(lead.geocoding_status)} />
          <Row label="Fournisseur" value={txt(lead.geocoding_provider)} />
          <Row label="Précision" value={txt(lead.location_type)} />
          <Row label="Place ID" value={txt(lead.place_id)} />
        </Grid>
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            className="mt-3 inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-primary px-3 py-2 font-display text-[11px] font-bold uppercase text-primary-foreground">
            <MapPin className="h-3.5 w-3.5" /> Ouvrir dans Google Maps
          </a>
        )}
      </Section>

      <Section title="Informations techniques" icon={ShieldCheck}>
        <Grid>
          <Row label="Numéro" value={lead.submission_number != null ? `#${lead.submission_number}` : NA} />
          <Row label="Identifiant" value={lead.id} />
          <Row label="Source" value={txt(lead.lead_source)} />
          <Row label="UTM source" value={txt(lead.utm_source)} />
          <Row label="UTM medium" value={txt(lead.utm_medium)} />
          <Row label="UTM campagne" value={txt(lead.utm_campaign)} />
          <Row label="Page d'arrivée" value={txt(lead.landing_referrer)} />
          <Row label="Type de service" value={txt(lead.service_type)} />
        </Grid>
        {lead.description && (
          <pre className="mt-3 whitespace-pre-wrap rounded bg-secondary/40 p-2 font-body text-[11px] text-muted-foreground">
            {lead.description}
          </pre>
        )}
      </Section>
    </div>
  );
}
