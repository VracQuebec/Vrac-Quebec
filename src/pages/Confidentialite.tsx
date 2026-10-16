import { Helmet } from "react-helmet-async";
import TransportBanner from "@/components/TransportBanner";
import { PUBLIC_PHONE, PUBLIC_PHONE_E164 } from "@/lib/public-phone";

// BROUILLON à faire approuver : ce texte décrit les fonctions réelles du site,
// mais ne constitue pas une attestation de conformité (Loi 25). Les mentions
// [À VALIDER] doivent être complétées par le responsable avant publication.
const Todo = ({ children }: { children: React.ReactNode }) => (
  <mark className="rounded bg-accent px-1 font-semibold text-accent-foreground">[À VALIDER] {children}</mark>
);

export default function Confidentialite() {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Politique de confidentialité | Vrac Québec</title>
        <meta name="description" content="Comment Vrac Québec recueille, utilise et protège vos renseignements personnels." />
        <meta name="robots" content="noindex,follow" />
      </Helmet>
      <TransportBanner />
      <main className="container mx-auto max-w-3xl px-4 py-12 font-body text-foreground [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-2">
        <p role="note" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          Brouillon en attente d'approbation — non publié. Les passages marqués [À VALIDER] restent à confirmer.
        </p>
        <h1 className="mt-6 font-display text-3xl font-extrabold">Politique de confidentialité</h1>
        <p>Dernière mise à jour : <Todo>date d'entrée en vigueur</Todo></p>

        <h2>Responsable de la protection des renseignements personnels</h2>
        <p><Todo>nom et titre de la personne responsable, adresse de contact écrite</Todo></p>
        <p>Téléphone : <a className="text-primary underline" href={`tel:${PUBLIC_PHONE_E164}`}>{PUBLIC_PHONE}</a></p>

        <h2>Renseignements recueillis</h2>
        <ul>
          <li>Demande de remblai et demande d'accès à une dompe : nom, téléphone, courriel, entreprise (facultatif), adresse du chantier, matériau, quantité, conditions d'accès, date souhaitée et commentaires.</li>
          <li>Photos que vous choisissez de téléverser avec une demande.</li>
          <li>Compte entrepreneur : courriel, mot de passe (conservé chiffré par le service d'authentification), nom, entreprise et téléphone.</li>
          <li>Conversations avec l'assistant du site, si vous l'utilisez.</li>
          <li>Données techniques : pages consultées et mesures d'audience, ainsi que des préférences et brouillons de formulaire enregistrés dans votre navigateur.</li>
        </ul>

        <h2>Utilisation</h2>
        <ul>
          <li>Traiter vos demandes, vous recommander des sites compatibles et calculer les distances.</li>
          <li>Vous joindre au sujet de votre demande et envoyer les courriels liés à votre compte ou à votre demande.</li>
          <li>Prévenir l'abus et améliorer le site.</li>
        </ul>
        <p>Vos coordonnées ne sont pas affichées aux autres utilisateurs. La position des dompes présentée aux entrepreneurs est approximative.</p>

        <h2>Fournisseurs de services</h2>
        <p>Certains renseignements sont traités par des fournisseurs, possiblement à l'extérieur du Québec :</p>
        <ul>
          <li>Hébergement, base de données, authentification et stockage des fichiers (Lovable Cloud).</li>
          <li>Google Maps Platform : validation d'adresses et calcul des distances.</li>
          <li>Google Analytics : mesure d'audience.</li>
          <li>Service d'envoi de courriels transactionnels.</li>
          <li>Service d'intelligence artificielle pour l'assistant du site.</li>
        </ul>
        <p><Todo>liste complète des fournisseurs et pays d'hébergement; évaluation des facteurs relatifs à la vie privée pour les transferts hors Québec</Todo></p>

        <h2>Conservation</h2>
        <p><Todo>durée de conservation des demandes, comptes, photos et conversations, et mode de destruction</Todo></p>

        <h2>Témoins et brouillons</h2>
        <p>Le navigateur conserve votre session et les réponses en cours de saisie afin que vous ne les perdiez pas. <Todo>consentement aux témoins de mesure d'audience</Todo></p>

        <h2>Vos droits</h2>
        <p>Vous pouvez demander l'accès à vos renseignements, leur rectification ou le retrait de votre consentement en communiquant avec nous. <Todo>délai de réponse et procédure de plainte</Todo></p>
      </main>
    </div>
  );
}
