import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Phone, MessageSquare } from "lucide-react";
import TransportBanner from "@/components/TransportBanner";
import { PUBLIC_PHONE, PUBLIC_PHONE_E164 } from "@/lib/public-phone";
import { DOMPE_PATH, REMBLAI_PATH } from "@/lib/navigation/priority-paths";

// Brouillon à approuver avant publication : noindex tant que le contenu n'est pas validé.
export default function Contact() {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Nous joindre | Vrac Québec</title>
        <meta name="description" content={`Joignez Vrac Québec par téléphone ou texto au ${PUBLIC_PHONE}.`} />
        <meta name="robots" content="noindex,follow" />
      </Helmet>
      <TransportBanner />
      <main className="container mx-auto max-w-2xl px-4 py-12 space-y-8">
        <h1 className="font-display text-3xl font-extrabold text-foreground">Nous joindre</h1>
        <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <a href={`tel:${PUBLIC_PHONE_E164}`} className="flex items-center gap-3 font-display text-2xl font-bold text-foreground hover:text-primary">
            <Phone className="h-6 w-6 text-primary" aria-hidden /> {PUBLIC_PHONE}
          </a>
          <a href={`sms:${PUBLIC_PHONE_E164}`} className="flex items-center gap-3 font-body text-foreground hover:text-primary">
            <MessageSquare className="h-5 w-5 text-primary" aria-hidden /> Texto au même numéro
          </a>
        </section>
        <section className="grid gap-3 sm:grid-cols-2">
          <Link to={DOMPE_PATH} className="rounded-xl bg-primary p-4 text-center font-display font-bold text-primary-foreground">Je cherche une dompe</Link>
          <Link to={REMBLAI_PATH} className="rounded-xl border-2 border-primary p-4 text-center font-display font-bold text-foreground">Je veux du remblai</Link>
        </section>
      </main>
    </div>
  );
}
