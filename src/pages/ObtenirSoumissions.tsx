// ============================================================
// PLACE DE MARCHÉ — « OBTENIR DES SOUMISSIONS » (étapes 4 et 5)
// Parcours progressif en 9 étapes, questions dynamiques selon la
// catégorie choisie, aucun champ obligatoire sauf un moyen de
// vous joindre. Fonctionne avec ou sans compte.
// ============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useSearchParams } from "react-router-dom";
import { useDraft } from "@/lib/drafts/useDraft";
import DraftStatusBar from "@/components/drafts/DraftStatusBar";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORY_FORMS, UNKNOWN, findForm, type DynamicField } from "@/lib/marketplace/forms";
import { CLIENT_TYPES } from "@/lib/marketplace/types";

const STEPS = [
  "Service recherché", "Localisation", "Description", "Détails du projet",
  "Échéancier", "Photos et documents", "Coordonnées", "Révision",
];

type Answers = Record<string, string | string[]>;

interface Contact {
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  organization_name: string;
  client_type: string;
}

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mkt-request-submit`;

export default function ObtenirSoumissions() {
  // NAV-01 : étape dans l'historique (?etape=) — Retour/Avance natifs et rechargement gardent la place.
  const [params, setParams] = useSearchParams();
  const step = Math.min(Math.max(Number(params.get("etape") || 1) - 1, 0), STEPS.length - 1);
  const setStep = (v: number | ((s: number) => number)) => {
    const n = Math.min(Math.max(typeof v === "function" ? v(step) : v, 0), STEPS.length - 1);
    if (n === step) return;
    setParams((p) => { const q = new URLSearchParams(p); if (n === 0) q.delete("etape"); else q.set("etape", String(n + 1)); return q; });
  };
  const [slug, setSlug] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [answers, setAnswers] = useState<Answers>({});
  const [desiredDate, setDesiredDate] = useState("");
  const [scheduleNote, setScheduleNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const EMPTY_CONTACT: Contact = {
    contact_name: "", contact_phone: "", contact_email: "",
    organization_name: "", client_type: "particulier",
  };
  const [contact, setContact] = useState<Contact>(EMPTY_CONTACT);
  const [honeypot, setHoneypot] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const startedAt = useRef(Date.now());
  const fileInput = useRef<HTMLInputElement>(null);

  // NAV-01 : brouillon local des champs texte (les fichiers ne peuvent pas être conservés).
  const draft = useDraft({
    id: { module: "obtenir-soumissions", form: "assistant", owner: "anon" },
    data: { step, slug, address, city, region, title, description, answers, desiredDate, scheduleNote, contact },
    isEmpty: (d) => !d.slug && !d.address && !d.city && !d.title && !d.description && !Object.keys(d.answers).length
      && !d.desiredDate && !d.scheduleNote && !d.contact.contact_name && !d.contact.contact_phone && !d.contact.contact_email,
    onRestore: (d) => {
      setSlug(d.slug); setAddress(d.address); setCity(d.city); setRegion(d.region); setTitle(d.title);
      setDescription(d.description); setAnswers(d.answers ?? {}); setDesiredDate(d.desiredDate);
      setScheduleNote(d.scheduleNote); setContact({ ...EMPTY_CONTACT, ...d.contact });
      if (d.step > 0) setParams((p) => { if (p.get("etape")) return p; const q = new URLSearchParams(p); q.set("etape", String(Math.min(d.step, STEPS.length - 1) + 1)); return q; }, { replace: true });
    },
  });
  const startOver = () => {
    draft.discard();
    setSlug(null); setAddress(""); setCity(""); setRegion(""); setTitle(""); setDescription("");
    setAnswers({}); setDesiredDate(""); setScheduleNote(""); setFiles([]); setContact(EMPTY_CONTACT); setStep(0);
  };
  // Étape impossible sans service (lien direct, brouillon abandonné) : retour au choix du service.
  useEffect(() => {
    if (!draft.ready || confirmation) return;
    const contactOk = !!(contact.contact_phone.trim() || contact.contact_email.trim());
    const bad = step > 0 && !slug ? 0 : step > 6 && !contactOk ? 6 : -1;
    if (bad < 0) return;
    setParams((p) => { const q = new URLSearchParams(p); if (bad === 0) q.delete("etape"); else q.set("etape", String(bad + 1)); return q; }, { replace: true });
    toast.message(`Étape « ${STEPS[bad]} » à compléter`, { description: "Cette information manque pour poursuivre; vos autres réponses sont conservées." });
  }, [draft.ready, step, slug, contact.contact_phone, contact.contact_email]); // eslint-disable-line react-hooks/exhaustive-deps

  const form = useMemo(() => (slug ? findForm(slug) : null), [slug]);

  // Récupération automatique des coordonnées d'un utilisateur connecté.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user;
      if (!u) return;
      setContact((c) => ({
        ...c,
        contact_email: c.contact_email || (u.email ?? ""),
        contact_name: c.contact_name || ((u.user_metadata?.full_name as string) ?? ""),
        contact_phone: c.contact_phone || ((u.user_metadata?.phone as string) ?? ""),
      }));
    });
  }, []);

  const setAnswer = (key: string, value: string | string[]) =>
    setAnswers((a) => ({ ...a, [key]: value }));

  const canContinue = () => {
    if (step === 0) return !!slug;
    if (step === 6) return !!(contact.contact_phone.trim() || contact.contact_email.trim());
    return true;
  };

  const goNext = () => {
    if (!canContinue()) {
      toast.error(step === 0 ? "Choisissez un service." : "Un téléphone ou un courriel est requis.");
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const goBack = () => {
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /** Photos : téléversées dans l'espace public déjà utilisé par les demandes. */
  const uploadFiles = async (): Promise<string[]> => {
    if (!files.length) return [];
    const folder = crypto.randomUUID();
    const paths: string[] = [];
    for (const file of files.slice(0, 8)) {
      const safe = file.name.toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(-60);
      const path = `submissions/${folder}/${Date.now()}-${safe}`;
      const { error } = await supabase.storage.from("lead-photos").upload(path, file);
      if (!error) paths.push(path);
    }
    return paths;
  };

  const submit = async () => {
    setSending(true);
    try {
      const photos = await uploadFiles().catch(() => []);
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const res = await fetch(FUNCTIONS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          category_slug: slug,
          title: title.trim() || `${form?.label ?? "Demande"} — ${city || "Québec"}`,
          description,
          answers: { ...answers, photos, note_echeancier: scheduleNote },
          address, city, region,
          desired_date: desiredDate || null,
          ...contact,
          website_hp: honeypot,
          form_started_at: startedAt.current,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? "Envoi impossible.");
      draft.finalize();
      setConfirmation(payload.request_number as string);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Envoi impossible.");
    } finally {
      setSending(false);
    }
  };

  if (confirmation) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <Helmet><title>Demande reçue | Vrac Québec</title></Helmet>
        <CheckCircle2 className="mx-auto h-14 w-14 text-primary" />
        <h1 className="mt-4 text-2xl font-bold">Votre demande a été reçue.</h1>
        <p className="mt-3 text-muted-foreground">
          Vrac Québec recherche maintenant les entreprises partenaires les mieux adaptées à votre projet.
        </p>
        <p className="mt-6 text-lg font-semibold">Numéro de votre demande : {confirmation}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild><Link to="/mes-soumissions">Suivre ma demande</Link></Button>
          <Button variant="outline" asChild><Link to="/">Retour à l'accueil</Link></Button>

        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
      <Helmet>
        <title>Obtenir des soumissions | Vrac Québec</title>
        <meta name="description" content="Décrivez votre besoin en quelques minutes et recevez des soumissions d'entreprises partenaires du Québec : transport, excavation, matériaux, pavage, déneigement et plus." />
        <link rel="canonical" href="https://vracquebec.ca/obtenir-des-soumissions" />
      </Helmet>

      <h1 className="text-2xl font-bold sm:text-3xl">Obtenir des soumissions</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Étape {step + 1} sur {STEPS.length} — {STEPS[step]}
      </p>
      <div className="mt-2"><DraftStatusBar status={draft.status} savedAt={draft.savedAt} restored={!!draft.restoredMeta} onDiscard={startOver} scope="ce navigateur" /></div>
      <div className="mt-3 h-2 w-full rounded-full bg-muted">
        <div className="h-2 rounded-full bg-primary transition-all"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
      </div>

      <div className="mt-6 space-y-5">
        {step === 0 && (
          <>
            <h2 className="text-lg font-semibold">De quoi avez-vous besoin?</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {CATEGORY_FORMS.map((c) => (
                <button key={c.slug} type="button" onClick={() => { setSlug(c.slug); setStep(1); }}
                  className={`rounded-xl border p-4 text-left transition hover:border-primary hover:shadow-md ${slug === c.slug ? "border-primary ring-2 ring-primary/30" : "border-border"}`}>
                  <span className="text-2xl" aria-hidden>{c.emoji}</span>
                  <span className="mt-2 block font-semibold">{c.label}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{c.tagline}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <Card className="space-y-4 p-4">
            <div>
              <Label htmlFor="ville">Ville</Label>
              <Input id="ville" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ex. Beauport" />
            </div>
            <div>
              <Label htmlFor="adresse">Adresse du projet (facultatif)</Label>
              <Input id="adresse" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="region">Région (facultatif)</Label>
              <Input id="region" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Ex. Capitale-Nationale" />
            </div>
          </Card>
        )}

        {step === 2 && (
          <Card className="space-y-4 p-4">
            <div>
              <Label htmlFor="titre">Titre de votre demande (facultatif)</Label>
              <Input id="titre" value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder={`Ex. ${form?.label ?? "Projet"} à ${city || "Québec"}`} />
            </div>
            <div>
              <Label htmlFor="desc">Décrivez votre besoin</Label>
              <Textarea id="desc" rows={6} value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Expliquez simplement ce que vous souhaitez faire réaliser." />
            </div>
          </Card>
        )}

        {step === 3 && (
          <Card className="space-y-5 p-4">
            <p className="text-sm text-muted-foreground">
              Répondez à ce que vous connaissez. Chaque question peut rester vide ou « {UNKNOWN} ».
            </p>
            {(form?.fields ?? []).map((f) => (
              <DynamicInput key={f.key} field={f} value={answers[f.key]} onChange={(v) => setAnswer(f.key, v)} />
            ))}
          </Card>
        )}

        {step === 4 && (
          <Card className="space-y-4 p-4">
            <div>
              <Label htmlFor="date">Date souhaitée (facultatif)</Label>
              <Input id="date" type="date" value={desiredDate} onChange={(e) => setDesiredDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="echeancier">Précisions sur l'échéancier</Label>
              <Textarea id="echeancier" rows={4} value={scheduleNote} onChange={(e) => setScheduleNote(e.target.value)}
                placeholder="Ex. dès que possible, printemps prochain, flexible…" />
            </div>
          </Card>
        )}

        {step === 5 && (
          <Card className="space-y-4 p-4">
            <p className="text-sm text-muted-foreground">
              Des photos aident beaucoup les entreprises à évaluer votre projet. Formats acceptés : JPG, PNG, WEBP.
            </p>
            <input ref={fileInput} type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])].slice(0, 8))} />
            <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
              <Paperclip className="mr-2 h-4 w-4" /> Ajouter des photos
            </Button>
            <ul className="space-y-2">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span className="truncate">{f.name}</span>
                  <button type="button" aria-label="Retirer" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {step === 6 && (
          <Card className="space-y-4 p-4">
            <div>
              <Label htmlFor="nom">Votre nom</Label>
              <Input id="nom" value={contact.contact_name}
                onChange={(e) => setContact({ ...contact, contact_name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="tel">Téléphone</Label>
              <Input id="tel" type="tel" value={contact.contact_phone}
                onChange={(e) => setContact({ ...contact, contact_phone: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="courriel">Courriel</Label>
              <Input id="courriel" type="email" value={contact.contact_email}
                onChange={(e) => setContact({ ...contact, contact_email: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="org">Nom de l'entreprise ou de l'organisation (facultatif)</Label>
              <Input id="org" value={contact.organization_name}
                onChange={(e) => setContact({ ...contact, organization_name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="type">Vous êtes</Label>
              <select id="type" value={contact.client_type}
                onChange={(e) => setContact({ ...contact, client_type: e.target.value })}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {CLIENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {/* Champ piège anti-robot : invisible pour les humains. */}
            <input tabIndex={-1} autoComplete="off" aria-hidden className="hidden"
              value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Aucune inscription requise. Vos coordonnées ne sont jamais affichées publiquement.
            </p>
          </Card>
        )}

        {step === 7 && (
          <Card className="space-y-3 p-4 text-sm">
            <h2 className="text-lg font-semibold">Révision</h2>
            <Row label="Service" value={form?.label} />
            <Row label="Lieu" value={[address, city, region].filter(Boolean).join(", ")} />
            <Row label="Description" value={description} />
            {(form?.fields ?? []).map((f) => (
              <Row key={f.key} label={f.label}
                value={Array.isArray(answers[f.key]) ? (answers[f.key] as string[]).join(", ") : (answers[f.key] as string)} />
            ))}
            <Row label="Date souhaitée" value={desiredDate} />
            <Row label="Échéancier" value={scheduleNote} />
            <Row label="Photos" value={files.length ? `${files.length} fichier(s)` : ""} />
            <Row label="Contact" value={[contact.contact_name, contact.contact_phone, contact.contact_email].filter(Boolean).join(" · ")} />
          </Card>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={goBack} disabled={step === 0}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Retour
        </Button>
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={goNext}>Continuer <ArrowRight className="ml-2 h-4 w-4" /></Button>
        ) : (
          <Button type="button" onClick={submit} disabled={sending}>
            {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Envoyer ma demande
          </Button>
        )}
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5 border-b pb-2 last:border-0 sm:flex-row sm:gap-3">
      <span className="min-w-44 font-medium text-muted-foreground">{label}</span>
      <span className="whitespace-pre-wrap">{value}</span>
    </div>
  );
}

function DynamicInput({ field, value, onChange }: {
  field: DynamicField;
  value?: string | string[];
  onChange: (v: string | string[]) => void;
}) {
  const id = `champ-${field.key}`;
  if (field.type === "choix") {
    return (
      <div>
        <Label htmlFor={id}>{field.label}</Label>
        <select id={id} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="">—</option>
          {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }
  if (field.type === "multi") {
    const selected = (value as string[]) ?? [];
    return (
      <div>
        <span className="text-sm font-medium">{field.label}</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {(field.options ?? []).map((o) => {
            const on = selected.includes(o);
            return (
              <button key={o} type="button"
                onClick={() => onChange(on ? selected.filter((s) => s !== o) : [...selected, o])}
                className={`rounded-full border px-3 py-1 text-sm ${on ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>
                {o}
              </button>
            );
          })}
        </div>
      </div>
    );
  }
  if (field.type === "long") {
    return (
      <div>
        <Label htmlFor={id}>{field.label}</Label>
        <Textarea id={id} rows={4} value={(value as string) ?? ""} placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  return (
    <div>
      <Label htmlFor={id}>{field.label}</Label>
      <Input id={id} type={field.type === "date" ? "date" : field.type === "nombre" ? "number" : "text"}
        value={(value as string) ?? ""} placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)} />
      {field.hint && <p className="mt-1 text-xs text-muted-foreground">{field.hint}</p>}
    </div>
  );
}
