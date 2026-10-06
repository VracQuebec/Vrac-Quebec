// ============================================================
// MON ENTREPRISE — écran d'application, pas formulaire administratif.
// Source unique : la fiche `entrepreneurs` du compte connecté
// (loadMyProfil / saveMyProfil / set_my_network_visibility).
// Aucun champ inventé, aucune règle métier modifiée.
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { markVoluntarySignOut } from "@/lib/navigation/returnTo";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import { LoadingSkeleton, SectionHeader, ErrorState } from "@/components/entrepreneur-app/AppStates";
import { BottomSheet } from "@/components/entrepreneur-app/ui";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  loadMyProfil,
  saveMyProfil,
  setMyNetworkVisibility,
  TRUCK_TYPE_OPTIONS,
  type ProfilEdits,
  type ProfilErrors,
  type ProfilReseau,
} from "@/lib/parcours/profil";
import {
  Building2, Phone, User as UserIcon, MapPin, ShieldCheck, Bell, Truck,
  ChevronRight, LogOut, Eye, EyeOff, Pencil, Lock, Globe,
} from "lucide-react";

type SheetKey = "contact" | "adresse" | "camions" | null;

const EntrepreneurCompte = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profil, setProfil] = useState<ProfilReseau | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [sheet, setSheet] = useState<SheetKey>(null);
  const [form, setForm] = useState<ProfilEdits | null>(null);
  const [errors, setErrors] = useState<ProfilErrors>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    const res = await loadMyProfil();
    if (res.state === "ok") setProfil(res.profil);
    else setFailed(true);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openSheet = (key: Exclude<SheetKey, null>) => {
    if (!profil) return;
    setForm({ ...profil.edits });
    setErrors({});
    setSheet(key);
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    const res = await saveMyProfil(form);
    setSaving(false);
    if (res.state === "invalid") { setErrors(res.errors); return; }
    if (res.state !== "ok") {
      toast({ title: "Enregistrement impossible", description: "Vos modifications n'ont pas été sauvegardées.", variant: "destructive" });
      return;
    }
    setSheet(null);
    toast({ title: "Modifications enregistrées" });
    await load();
  };

  const toggleVisibility = async (v: boolean) => {
    const res = await setMyNetworkVisibility(v);
    if (res.state !== "ok") {
      toast({ title: "Changement impossible", variant: "destructive" });
      return;
    }
    setProfil((p) => (p ? { ...p, networkOptIn: res.visible, edits: { ...p.edits, is_network_visible: res.visible } } : p));
    toast({ title: res.visible ? "Votre entreprise est visible dans l'annuaire" : "Votre entreprise est masquée" });
  };

  const logout = async () => {
    markVoluntarySignOut(); await supabase.auth.signOut();
    navigate("/login");
  };

  const e = profil?.edits;
  const loc = profil?.publicLocalisation;
  const initials = (e?.company || e?.contact_name || "?").trim().slice(0, 2).toUpperCase();
  const region = [loc?.city, loc?.region].filter(Boolean).join(" · ");

  return (
    <EntrepreneurAppShell title="Mon entreprise" subtitle="Profil, camions et visibilité" backTo="/entrepreneur">
      <div className="mx-auto w-full min-w-0 max-w-2xl px-4 py-5 sm:px-6 space-y-6">
        {loading ? (
          <LoadingSkeleton lines={3} />
        ) : failed || !profil || !e ? (
          <ErrorState message="Votre fiche entreprise n'a pas pu être chargée." onRetry={load} />
        ) : (
          <>
            {/* ---------- Identité ---------- */}
            <section className="rounded-3xl border border-border/70 bg-gradient-to-br from-primary/10 via-card to-card p-5">
              <div className="flex items-center gap-4">
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary font-display text-xl font-extrabold text-primary-foreground">
                  {initials}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate font-display text-lg font-extrabold">
                    {e.company || "Votre entreprise"}
                  </h2>
                  <p className="truncate font-body text-sm text-muted-foreground">
                    {region || "Localisation non renseignée"}
                  </p>
                  <span
                    className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-display text-[11px] font-semibold ${
                      profil.networkOptIn
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {profil.networkOptIn ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    {profil.networkOptIn ? "Profil public actif" : "Profil masqué"}
                  </span>
                </div>
              </div>
              {(profil.demandes != null || profil.chantiers != null) && (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-2xl bg-background/60 py-3 text-center">
                    <p className="font-display text-xl font-bold">{profil.demandes ?? "—"}</p>
                    <p className="font-body text-[11px] text-muted-foreground">Demandes</p>
                  </div>
                  <div className="rounded-2xl bg-background/60 py-3 text-center">
                    <p className="font-display text-xl font-bold">{profil.chantiers ?? "—"}</p>
                    <p className="font-body text-[11px] text-muted-foreground">Chantiers</p>
                  </div>
                </div>
              )}
            </section>

            {/* ---------- PRIVÉ ---------- */}
            <section>
              <SectionHeader
                title={
                  <span className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-muted-foreground" /> Informations privées
                  </span>
                }
              />
              <p className="-mt-2 mb-3 font-body text-xs text-muted-foreground">Visible uniquement par vous.</p>
              <div className="space-y-2">
                <EditRow
                  icon={<UserIcon className="h-5 w-5" />}
                  label="Coordonnées"
                  value={[e.contact_name, e.phone].filter(Boolean).join(" · ") || "À compléter"}
                  onEdit={() => openSheet("contact")}
                />
                <EditRow
                  icon={<MapPin className="h-5 w-5" />}
                  label="Adresse"
                  value={e.address || "À compléter"}
                  onEdit={() => openSheet("adresse")}
                />
              </div>
            </section>

            {/* ---------- PUBLIC ---------- */}
            <section>
              <SectionHeader
                title={
                  <span className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-primary" /> Profil public
                  </span>
                }
              />
              <p className="-mt-2 mb-3 font-body text-xs text-muted-foreground">Visible dans l'annuaire du réseau.</p>
              <div className="space-y-2">
                <EditRow
                  icon={<Building2 className="h-5 w-5" />}
                  label="Nom de l'entreprise"
                  value={e.company || "À compléter"}
                  onEdit={() => openSheet("contact")}
                />
                <EditRow
                  icon={<Truck className="h-5 w-5" />}
                  label="Camions"
                  value={
                    e.truck_types.length > 0 || e.truck_count
                      ? [e.truck_types.join(", "), e.truck_count && `${e.truck_count} camion(s)`]
                          .filter(Boolean)
                          .join(" · ")
                      : "À compléter"
                  }
                  onEdit={() => openSheet("camions")}
                />
              </div>

              {/* Aperçu du profil public — uniquement des données existantes */}
              <div className="mt-3 rounded-3xl border border-primary/30 bg-primary/5 p-4">
                <p className="font-display text-[10px] uppercase tracking-[0.16em] text-primary">
                  Aperçu du profil public
                </p>
                <p className="mt-1.5 font-display text-base font-bold">{e.company || "Nom à compléter"}</p>
                <p className="font-body text-xs text-muted-foreground">
                  {region || "Localisation non renseignée"}
                </p>
                {e.truck_types.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {e.truck_types.map((t) => (
                      <li key={t} className="rounded-full bg-primary/10 px-2 py-0.5 font-body text-[11px] text-primary">
                        {t}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

            </section>

            <section>
              <SectionHeader title="Visibilité" />
              <div className="flex items-center gap-3 rounded-md border border-border bg-card p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Eye className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-body font-semibold">Apparaître dans l'annuaire</p>
                  <p className="font-body text-xs text-muted-foreground">
                    Vous pouvez vous retirer à tout moment.
                  </p>
                </div>
                <Switch
                  checked={profil.networkOptIn}
                  onCheckedChange={(v) => void toggleVisibility(v)}
                  aria-label="Apparaître dans l'annuaire"
                />
              </div>
            </section>

            {/* ---------- Confidentialité & préférences ---------- */}
            <section>
              <SectionHeader title="Confidentialité et préférences" />
              <p className="mb-3 flex items-start gap-2 rounded-2xl bg-secondary/60 p-3 font-body text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Votre téléphone, votre adresse et votre courriel ne sont jamais transmis aux autres
                entreprises du réseau.
              </p>
              <div className="space-y-2">
                <NavRow to="/entrepreneur/notifications" icon={<Bell className="h-5 w-5" />} label="Notifications" hint="Ce que vous recevez" />
                
              </div>
            </section>

            <p className="px-1 font-body text-xs text-muted-foreground">
              Une information ne peut pas être corrigée ici ? Appelez le 819-592-3495.
            </p>

            <button
              onClick={logout}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card font-body text-sm text-muted-foreground transition-transform active:scale-[0.99]"
            >
              <LogOut className="h-4 w-4" /> Déconnexion
            </button>
          </>
        )}
      </div>

      {/* ---------- Feuilles d'édition : une section = un bloc ---------- */}
      <BottomSheet
        open={sheet !== null}
        onOpenChange={(v) => !v && setSheet(null)}
        title={sheet === "camions" ? "Camions" : sheet === "adresse" ? "Adresse" : "Coordonnées"}
      >
        {form && (
          <div className="space-y-4">
            {sheet === "contact" && (
              <>
                <Field label="Nom de l'entreprise" error={errors.company}>
                  <input
                    className="min-h-12 w-full rounded-xl border border-border bg-background px-3 font-body text-sm"
                    value={form.company}
                    onChange={(ev) => setForm({ ...form, company: ev.target.value })}
                  />
                </Field>
                <Field label="Personne-ressource" error={errors.contact_name}>
                  <input
                    className="min-h-12 w-full rounded-xl border border-border bg-background px-3 font-body text-sm"
                    value={form.contact_name}
                    onChange={(ev) => setForm({ ...form, contact_name: ev.target.value })}
                  />
                </Field>
                <Field label="Téléphone" error={errors.phone}>
                  <input
                    className="min-h-12 w-full rounded-xl border border-border bg-background px-3 font-body text-sm"
                    inputMode="tel"
                    value={form.phone}
                    onChange={(ev) => setForm({ ...form, phone: ev.target.value })}
                  />
                </Field>
              </>
            )}

            {sheet === "adresse" && (
              <Field label="Adresse (privée)" error={errors.address}>
                <input
                  className="min-h-12 w-full rounded-xl border border-border bg-background px-3 font-body text-sm"
                  value={form.address}
                  onChange={(ev) => setForm({ ...form, address: ev.target.value })}
                />
              </Field>
            )}

            {sheet === "camions" && (
              <>
                <Field label="Types de camions" error={errors.truck_types}>
                  <div className="flex flex-wrap gap-2">
                    {TRUCK_TYPE_OPTIONS.map((t) => {
                      const on = form.truck_types.includes(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              truck_types: on
                                ? form.truck_types.filter((x) => x !== t)
                                : [...form.truck_types, t],
                            })
                          }
                          className={`min-h-11 rounded-xl px-3 font-body text-sm transition-transform active:scale-95 ${
                            on ? "bg-primary text-primary-foreground" : "border border-border bg-card"
                          }`}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </Field>
                <Field label="Nombre de camions" error={errors.truck_count}>
                  <input
                    className="min-h-12 w-full rounded-xl border border-border bg-background px-3 font-body text-sm"
                    inputMode="numeric"
                    value={form.truck_count}
                    onChange={(ev) => setForm({ ...form, truck_count: ev.target.value })}
                  />
                </Field>
              </>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSheet(null)}
                className="min-h-12 flex-1 rounded-2xl border border-border font-body text-sm"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="min-h-12 flex-1 rounded-2xl bg-primary font-display text-sm font-bold text-primary-foreground disabled:opacity-60"
              >
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        )}
      </BottomSheet>
    </EntrepreneurAppShell>
  );
};

const Field = ({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="mb-1.5 block font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
      {label}
    </span>
    {children}
    {error && <span className="mt-1 block font-body text-xs text-destructive">{error}</span>}
  </label>
);

const EditRow = ({
  icon, label, value, onEdit,
}: { icon: React.ReactNode; label: string; value: string; onEdit: () => void }) => (
  <button
    type="button"
    onClick={onEdit}
    className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left transition-transform active:scale-[0.99]"
  >
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">{icon}</span>
    <span className="min-w-0 flex-1">
      <span className="block font-display text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="block break-words font-body text-sm leading-snug">{value}</span>
    </span>
    <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" />
  </button>
);

const NavRow = ({ to, icon, label, hint }: { to: string; icon: React.ReactNode; label: string; hint: string }) => (
  <Link
    to={to}
    className="flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 transition-transform active:scale-[0.99]"
  >
    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</span>
    <span className="min-w-0 flex-1">
      <span className="block font-body font-semibold text-foreground">{label}</span>
      <span className="block font-body text-xs leading-snug text-muted-foreground">{hint}</span>
    </span>
    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
  </Link>
);

export default EntrepreneurCompte;
