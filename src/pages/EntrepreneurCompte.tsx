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
import CompanyProfileDetails from "@/components/entrepreneur-app/CompanyProfileDetails";
import { Button } from "@/components/ui/button";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
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
  Building2, User as UserIcon, MapPin, ShieldCheck, Bell,
  ChevronRight, LogOut, Eye, EyeOff, Pencil,
} from "lucide-react";

type SheetKey = "contact" | "adresse" | "camions" | null;

const EntrepreneurCompte = () => {
  const { user, isReady } = useAuthReady();
  const { roles, loading: rolesLoading } = useUserRoles(user, isReady);
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
  const companyName = e?.company && !/^entreprise de\s+.*@/i.test(e.company) ? e.company : null;
  const accountName = typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name : typeof user?.user_metadata?.name === "string" ? user.user_metadata.name : null;
  const roleLabels: Record<string, string> = { admin: "Administrateur", entrepreneur: "Entrepreneur", proprietaire: "Propriétaire", transporteur: "Transporteur", user: "Utilisateur" };
  const loc = profil?.publicLocalisation;
  const initials = (e?.company || e?.contact_name || "?").trim().slice(0, 2).toUpperCase();
  const region = [loc?.city, loc?.region].filter(Boolean).join(" · ");

  return (
    <EntrepreneurAppShell title="Mon entreprise" backTo="/entrepreneur">
      <div className="mx-auto w-full min-w-0 max-w-2xl px-4 py-5 sm:px-6 space-y-6">
        {loading ? (
          <LoadingSkeleton lines={3} />
        ) : failed || !profil || !e ? (
          <ErrorState message="Votre fiche entreprise n'a pas pu être chargée." onRetry={load} />
        ) : (
          <>
            {user && <CompanyProfileDetails userId={user.id} fallbackName={companyName} fallbackLocation={region} />}

            <section id="mon-compte" aria-label="Mon compte" className="scroll-mt-20">
              <SectionHeader title={<span className="flex items-center gap-2"><UserIcon className="h-4 w-4 text-muted-foreground" />Mon compte</span>} />
              <dl className="space-y-3 text-sm">
                <div><dt className="text-xs text-muted-foreground">Nom de l’utilisateur</dt><dd className="mt-1 break-words">{accountName || "À compléter"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Courriel</dt><dd className="mt-1 break-words">{user?.email || "À compléter"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Rôle</dt><dd className="mt-1">{rolesLoading ? "Chargement…" : roles.map(role => roleLabels[role] || role).join(" · ") || "À compléter"}</dd></div>
              </dl>
            </section>

            {/* ---------- ENTREPRISE ---------- */}
            <section>
              <SectionHeader
                title={
                  <span className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" /> Mon entreprise
                  </span>
                }
              />
              <div className="space-y-2">
                <EditRow icon={<Building2 className="h-5 w-5" />} label="Nom de l’entreprise" value={companyName || "À compléter"} onEdit={() => openSheet("contact")} />
                <EditRow
                  icon={<UserIcon className="h-5 w-5" />}
                   label="Personne-ressource · téléphone professionnel"
                  value={[e.contact_name, e.phone].filter(Boolean).join(" · ") || "À compléter"}
                  onEdit={() => openSheet("contact")}
                />
                <EditRow
                  icon={<MapPin className="h-5 w-5" />}
                  label="Adresse"
                  value={e.address || "À compléter"}
                  onEdit={() => openSheet("adresse")}
                />
                <EditRow icon={<MapPin className="h-5 w-5" />} label="Ville" value={loc?.city || "À compléter"} onEdit={() => openSheet("adresse")} />
              </div>
            </section>

            <section>
              <SectionHeader title="Réseau Vrac Québec" />
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
            <section id="preferences" className="scroll-mt-20">
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

            <Button variant="ghost"
              onClick={logout}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card font-body text-sm text-muted-foreground transition-transform active:scale-[0.99]"
            >
              <LogOut className="h-4 w-4" /> Déconnexion
            </Button>
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
                        <Button variant="ghost"
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
                        </Button>
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
              <Button variant="outline"
                type="button"
                onClick={() => setSheet(null)}
                className="min-h-12 flex-1 rounded-2xl border border-border font-body text-sm"
              >
                Annuler
              </Button>
              <Button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="min-h-12 flex-1 rounded-2xl bg-primary font-display text-sm font-bold text-primary-foreground disabled:opacity-60"
              >
                {saving ? "Enregistrement…" : "Enregistrer"}
              </Button>
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
  <Button variant="ghost"
    type="button"
    onClick={onEdit}
    className="flex h-auto min-h-14 w-full items-center gap-3 whitespace-normal rounded-lg border-b border-border/30 px-2 py-3 text-left transition-transform active:scale-[0.99]"
  >
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">{icon}</span>
    <span className="min-w-0 flex-1">
      <span className="block font-display text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="block break-words font-body text-sm leading-snug">{value}</span>
    </span>
    <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" />
  </Button>
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
