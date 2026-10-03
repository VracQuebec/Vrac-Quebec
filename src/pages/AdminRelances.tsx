// Lot 6 — calendrier des relances : aperçu de ce qui serait dû pour chaque inscrit.
// Aucun envoi ici. Les promotions exigent consentement + désabonnement et partiront par Mailchimp une fois connecté.
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import PageHeader from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import MailchimpAdmin from "@/components/marketing/MailchimpAdmin";
import { nextStep, PROMO_GAP_DAYS, type Profile } from "@/lib/ops/cadence";

type Row = { name: string; email: string | null; p: Profile };

export default function AdminRelances() {
  const { isReady, user } = useAuthReady();
  const { isAdmin, loading: rl } = useUserRoles(user, isReady);
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    void (async () => {
      const [e, s] = await Promise.all([
        supabase.from("entrepreneurs").select("name,company,email,created_at").order("created_at", { ascending: false }).limit(200),
        supabase.from("submissions").select("name,email,created_at,updated_at").eq("request_type", "remblai").order("created_at", { ascending: false }).limit(200),
      ]);
      const mk = (audience: Profile["audience"], created: string, activity: string | null): Profile => ({
        audience, signedUpAt: created, consent: false, unsubscribed: false, lastActivityAt: activity, lastPromoAt: null,
        stepsIncomplete: false, remblaiFinishedAt: null, sent: ["bienvenue"], ignoredSinceInactive: 0,
      });
      setRows([
        ...(e.data ?? []).map((r) => ({ name: r.company || r.name, email: r.email, p: mk("entrepreneur", r.created_at, null) })),
        ...(s.data ?? []).map((r) => ({ name: r.name, email: r.email, p: mk("client", r.created_at, r.updated_at) })),
      ]);
    })();
  }, [isAdmin]);

  const due = useMemo(() => (rows ?? []).map((r) => ({ ...r, step: nextStep(r.p), stepIfConsent: nextStep({ ...r.p, consent: true }) })), [rows]);

  if (!isReady || rl) return <p className="p-8"><Loader2 className="inline h-4 w-4 animate-spin" /></p>;
  if (!isAdmin) return <p className="p-8 text-muted-foreground">Accès réservé à l'équipe Vrac Québec.</p>;

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Relances commerciales" subtitle={`Calendrier : bienvenue · J+3 · J+10 · J+21 · client mensuel / entrepreneur aux 2 semaines · fin du remblai · 60 jours d'inactivité. Plafond : 1 promotion par ${PROMO_GAP_DAYS} jours.`} />
      <main className="mx-auto max-w-5xl space-y-3 px-4 py-5">
        <Card><CardContent className="p-3 text-sm">
          Aucun courriel promotionnel ne part pour l'instant : il faut le consentement de la personne et le compte Mailchimp connecté.
          La colonne « si consentement » montre ce qui serait envoyé.
        </CardContent></Card>
        <MailchimpAdmin />
        {!rows ? <Loader2 className="h-4 w-4 animate-spin" /> : due.map((r, i) => (
          <Card key={i}><CardContent className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <div className="min-w-0"><p className="font-semibold">{r.name}</p><p className="text-xs text-muted-foreground">{r.p.audience === "client" ? "Client dompe" : "Entrepreneur"} · inscrit le {new Date(r.p.signedUpAt).toLocaleDateString("fr-CA")}</p></div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Maintenant : {r.step?.label ?? "rien"}</Badge>
              <Badge variant="outline">Si consentement : {r.stepIfConsent?.label ?? "rien"}</Badge>
            </div>
          </CardContent></Card>
        ))}
      </main>
    </div>
  );
}
