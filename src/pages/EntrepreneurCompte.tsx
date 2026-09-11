// Mon entreprise — fiche courte, orientée « qu'est-ce que je peux faire ici ».
// Lecture seule : aucune règle métier ni permission modifiée.
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import { LoadingSkeleton, SectionHeader } from "@/components/entrepreneur-app/AppStates";
import { useAuthReady } from "@/hooks/useAuthReady";
import {
  Mail, Building2, Phone, User as UserIcon, MapPin, ShieldCheck, Bell,
  ChevronRight, LogOut, Users,
} from "lucide-react";

interface Profile {
  name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  contact_name: string | null;
  billing_address: string | null;
}

const EntrepreneurCompte = () => {
  const { user } = useAuthReady();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("entrepreneurs")
        .select("name, company, phone, email, contact_name, billing_address")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!active) return;
      setProfile((data as Profile) ?? null);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [user]);

  const logout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const initials = (profile?.company || profile?.name || user?.email || "?")
    .trim().slice(0, 2).toUpperCase();

  return (
    <EntrepreneurAppShell title="Mon entreprise" subtitle="Profil et préférences" backTo="/entrepreneur">
      <div className="mx-auto w-full min-w-0 max-w-2xl px-4 py-5 sm:px-6 space-y-5">
        {loading ? (
          <LoadingSkeleton lines={2} />
        ) : (
          <>
            {/* Identité */}
            <section className="rounded-3xl border border-border/70 bg-gradient-to-br from-primary/10 via-card to-card p-5">
              <div className="flex items-center gap-4">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary font-display text-lg font-extrabold text-primary-foreground">
                  {initials}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate font-display text-lg font-extrabold">
                    {profile?.company || profile?.name || "Votre entreprise"}
                  </h2>
                  <p className="truncate font-body text-sm text-muted-foreground">
                    {profile?.email || user?.email || "—"}
                  </p>
                </div>
              </div>
              <p className="mt-4 flex items-start gap-2 rounded-2xl bg-background/60 p-3 font-body text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Vos coordonnées ne sont jamais transmises aux autres entreprises du réseau. Seule
                votre identité professionnelle publique est visible dans l'annuaire.
              </p>
            </section>

            {/* Coordonnées */}
            <section>
              <SectionHeader title="Coordonnées" />
              <div className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card">
                <Row icon={<UserIcon className="h-4 w-4" />} label="Responsable" value={profile?.contact_name || profile?.name || "—"} />
                <Row icon={<Building2 className="h-4 w-4" />} label="Entreprise" value={profile?.company || "—"} />
                <Row icon={<Phone className="h-4 w-4" />} label="Téléphone" value={profile?.phone || "—"} />
                <Row icon={<Mail className="h-4 w-4" />} label="Courriel" value={profile?.email || user?.email || "—"} />
                <Row icon={<MapPin className="h-4 w-4" />} label="Adresse de facturation" value={profile?.billing_address || "—"} />
              </div>
              <p className="mt-2 px-1 font-body text-xs text-muted-foreground">
                Pour corriger une information, écrivez-nous ou appelez le 581-994-7717.
              </p>
            </section>

            {/* Raccourcis */}
            <section>
              <SectionHeader title="Préférences" />
              <div className="space-y-2">
                <NavRow to="/notifications" icon={<Bell className="h-5 w-5" />} label="Avis et rappels" hint="Choisir ce que vous recevez" />
                <NavRow to="/entrepreneur/reseau" icon={<Users className="h-5 w-5" />} label="Réseau professionnel" hint="Votre visibilité publique" />
              </div>
            </section>

            <button
              onClick={logout}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card font-body text-sm text-muted-foreground active:scale-95 transition-transform"
            >
              <LogOut className="h-4 w-4" /> Déconnexion
            </button>
          </>
        )}
      </div>
    </EntrepreneurAppShell>
  );
};

const Row = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="flex items-start gap-3 px-4 py-3.5">
    <span className="mt-0.5 text-primary">{icon}</span>
    <div className="min-w-0">
      <p className="font-display text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-body text-sm text-foreground">{value}</p>
    </div>
  </div>
);

const NavRow = ({ to, icon, label, hint }: { to: string; icon: React.ReactNode; label: string; hint: string }) => (
  <Link
    to={to}
    className="flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 active:scale-[0.99] transition-transform"
  >
    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</span>
    <span className="min-w-0 flex-1">
      <span className="block font-body font-semibold text-foreground">{label}</span>
      <span className="block truncate font-body text-xs text-muted-foreground">{hint}</span>
    </span>
    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
  </Link>
);

export default EntrepreneurCompte;
