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
        <div role="note" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="!mt-0 font-semibold">Brouillon incomplet — cette politique n'est pas finale et ne doit pas être publiée.</p>
          <p>Informations à fournir par Vrac Québec avant publication :</p>
          <ol className="ml-5 list-decimal">
            <li>Nom et titre du responsable de la protection des renseignements personnels, courriel et adresse postale de contact.</li>
            <li>Raison sociale exacte de l'entreprise exploitante et date d'entrée en vigueur.</li>
            <li>Durée de conservation configurée dans Google Analytics (2 ou 14 mois).</li>
            <li>Durées de conservation des demandes, comptes, photos, conversations et mode de destruction.</li>
            <li>Nom du service d'envoi de courriels et du service d'intelligence artificielle retenus, avec leur pays d'hébergement.</li>
            <li>Confirmation de l'évaluation des facteurs relatifs à la vie privée pour les transferts hors Québec.</li>
            <li>Délai de réponse aux demandes d'accès et procédure de plainte.</li>
          </ol>
        </div>
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
          <li>Google Maps Platform (Google LLC, serveurs pouvant être situés hors du Québec, notamment aux États-Unis) : service nécessaire au fonctionnement, non soumis au choix des témoins. Lorsque vous utilisez un champ d'adresse ou une carte, votre navigateur charge le service de Google, qui reçoit alors votre adresse IP, les caractères saisis pour proposer des adresses et les informations techniques du navigateur. Après l'envoi d'une demande, nos serveurs transmettent à Google l'adresse du chantier ou du site pour obtenir ses coordonnées et calculer distances et durées de trajet. Votre nom, courriel et téléphone ne sont pas transmis à Google Maps. La carte n'est pas affichée sur le site public.</li>
          <li>Google Analytics : mesure d'audience.</li>
          <li>Service d'envoi de courriels transactionnels.</li>
          <li>Service d'intelligence artificielle pour l'assistant du site.</li>
        </ul>
        <p><Todo>liste complète des fournisseurs et pays d'hébergement; évaluation des facteurs relatifs à la vie privée pour les transferts hors Québec</Todo></p>

        <h2>Conservation</h2>
        <p><Todo>durée de conservation des demandes, comptes, photos et conversations, et mode de destruction</Todo></p>

        <h2>Témoins et brouillons</h2>
        <p>Le navigateur conserve votre session, les réponses en cours de saisie et votre choix de témoins afin que vous ne les perdiez pas. Ces éléments essentiels restent sur votre appareil.</p>
        <p>Mesure d'audience : seulement si vous l'acceptez, Google Analytics 4 (Google LLC, serveurs pouvant être situés hors du Québec, notamment aux États-Unis) reçoit les pages publiques consultées, sans paramètres d'adresse autres que ceux de campagne, ainsi que quelques actions anonymes (choix d'un parcours, bouton d'appel, envoi réussi d'un formulaire). L'adresse IP est tronquée et les signaux publicitaires Google sont désactivés. Aucune mesure n'a lieu dans les espaces connectés, le CRM ni les liens personnels de suivi; aucun nom, courriel, téléphone, adresse, code ou numéro de dossier n'est transmis. Nous n'utilisons aucun témoin publicitaire.</p>
        <p>Vous pouvez accepter, refuser ou personnaliser, puis changer d'avis en tout temps avec le lien « Témoins » au bas des pages. Un refus efface les témoins de mesure déjà déposés. <Todo>durée de conservation configurée dans Google Analytics (2 ou 14 mois)</Todo></p>

        <h2>Vos droits</h2>
        <p>Vous pouvez demander l'accès à vos renseignements, leur rectification ou le retrait de votre consentement en communiquant avec nous. <Todo>délai de réponse et procédure de plainte</Todo></p>
      </main>
    </div>
  );
}
