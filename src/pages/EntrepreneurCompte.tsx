import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import EntrepreneurShell from "@/components/EntrepreneurShell";
import { useAuthReady } from "@/hooks/useAuthReady";
import { Loader2, Mail, Building2, Phone, User as UserIcon } from "lucide-react";

const EntrepreneurCompte = () => {
  const { user } = useAuthReady();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("entrepreneurs").select("name, company, phone, email").eq("user_id", user.id).maybeSingle();
      setProfile(data);
      setLoading(false);
    })();
  }, [user]);

  return (
    <EntrepreneurShell title="Mon compte" description="Informations de votre entreprise.">
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-6 space-y-4 max-w-2xl">
          <Row icon={<Mail className="w-4 h-4" />} label="Email" value={profile?.email || user?.email || "—"} />
          <Row icon={<UserIcon className="w-4 h-4" />} label="Nom" value={profile?.name || "—"} />
          <Row icon={<Building2 className="w-4 h-4" />} label="Entreprise" value={profile?.company || "—"} />
          <Row icon={<Phone className="w-4 h-4" />} label="Téléphone" value={profile?.phone || "—"} />
          <p className="text-xs text-muted-foreground pt-2 border-t border-border font-body">
            Pour modifier ces informations, contactez Transport JSC au 581-994-7717.
          </p>
        </div>
      )}
    </EntrepreneurShell>
  );
};

const Row = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="flex items-start gap-3">
    <span className="mt-1 text-primary">{icon}</span>
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-display font-bold">{label}</p>
      <p className="font-body text-foreground">{value}</p>
    </div>
  </div>
);

export default EntrepreneurCompte;