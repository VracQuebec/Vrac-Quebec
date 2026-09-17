import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { useEffect, lazy, Suspense } from "react";
import { Helmet } from "react-helmet-async";
import Index from "./pages/Index";
import SessionKeeper from "./components/SessionKeeper";
import AppErrorBoundary from "./components/AppErrorBoundary";
import UniversalNav from "./components/UniversalNav";
import { trackPageView } from "./lib/analytics/ga4";
import { useAdminNotifications } from "./hooks/useAdminNotifications";
import { EntrepreneurDataProvider } from "./lib/entrepreneur-app/EntrepreneurDataProvider";

function AdminNotificationsMount() {
  useAdminNotifications();
  return null;
}

const Login = lazy(() => import("./pages/Login"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminData = lazy(() => import("./pages/AdminData"));
const AdminCalendar = lazy(() => import("./pages/AdminCalendar"));
const AdminFleet = lazy(() => import("./pages/AdminFleet"));
const AdminFleetVehicle = lazy(() => import("./pages/AdminFleetVehicle"));
const AdminMarketplaceCategories = lazy(() => import("./pages/AdminMarketplaceCategories"));
const AdminMarketplaceMatching = lazy(() => import("./pages/AdminMarketplaceMatching"));
const AdminMarketplaceLots = lazy(() => import("./pages/AdminMarketplaceLots"));
const AdminMarketplaceRequests = lazy(() => import("./pages/AdminMarketplaceRequests"));
const AdminMarketplaceCommissions = lazy(() => import("./pages/AdminMarketplaceCommissions"));
const PartenaireProfil = lazy(() => import("./pages/PartenaireProfil"));
const PartenaireSoumissions = lazy(() => import("./pages/PartenaireSoumissions"));
const Entrepreneur = lazy(() => import("./pages/Entrepreneur"));
const EntrepreneurDashboard = lazy(() => import("./pages/EntrepreneurDashboard"));
const EntrepreneurDemandes = lazy(() => import("./pages/EntrepreneurDemandes"));
const EntrepreneurChantiers = lazy(() => import("./pages/EntrepreneurChantiers"));
const EntrepreneurChantierDetail = lazy(() => import("./pages/EntrepreneurChantierDetail"));
const EntrepreneurFavoris = lazy(() => import("./pages/EntrepreneurFavoris"));
const EntrepreneurHistorique = lazy(() => import("./pages/EntrepreneurHistorique"));
const EntrepreneurCompte = lazy(() => import("./pages/EntrepreneurCompte"));
const EntrepreneurNotifications = lazy(() => import("./pages/EntrepreneurNotifications"));
const EntrepreneurSignup = lazy(() => import("./pages/EntrepreneurSignup"));
const EspaceEntrepreneur = lazy(() => import("./pages/EspaceEntrepreneur"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Blog = lazy(() => import("./pages/Blog"));
const BlogCategory = lazy(() => import("./pages/BlogCategory"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const BlogSearch = lazy(() => import("./pages/BlogSearch"));
const AdminBlog = lazy(() => import("./pages/AdminBlog"));
const AdminBlogIdeas = lazy(() => import("./pages/AdminBlogIdeas"));
const AdminBlogEditor = lazy(() => import("./pages/AdminBlogEditor"));
const AdminBlogBatch = lazy(() => import("./pages/AdminBlogBatch"));
const AdminBlogMesh = lazy(() => import("./pages/AdminBlogMesh"));
const BlogTools = lazy(() => import("./pages/BlogTools"));
const BlogCalculator = lazy(() => import("./pages/BlogCalculator"));
const BlogGuides = lazy(() => import("./pages/BlogGuides"));
const BlogFaq = lazy(() => import("./pages/BlogFaq"));
const AdminBlacklist = lazy(() => import("./pages/AdminBlacklist"));
const ZonesIndex = lazy(() => import("./pages/ZonesIndex"));
const ZoneCityIndex = lazy(() => import("./pages/ZoneCityIndex"));
const AdminSeoManager = lazy(() => import("./pages/AdminSeoManager"));
const SeoLandingPage = lazy(() => import("./pages/SeoLandingPage"));
const TransportRequest = lazy(() => import("./pages/TransportRequest"));
const Soumission = lazy(() => import("./pages/Soumission"));
const AchatVrac = lazy(() => import("./pages/AchatVrac"));
const ClientPortal = lazy(() => import("./pages/ClientPortal"));
const DriverPortal = lazy(() => import("./pages/DriverPortal"));
const AdminSoumissionConfig = lazy(() => import("./pages/AdminSoumissionConfig"));
const AdminTransportCapacities = lazy(() => import("./pages/AdminTransportCapacities"));
const AdminMatchingLab = lazy(() => import("./pages/AdminMatchingLab"));
const AdminMatchingSimulation = lazy(() => import("./pages/AdminMatchingSimulation"));
const AdminMaterialQualification = lazy(() => import("./pages/AdminMaterialQualification"));
const AdminQualificationQueue = lazy(() => import("./pages/AdminQualificationQueue"));
const AdminMaterialOffers = lazy(() => import("./pages/AdminMaterialOffers"));
const AdminMatchingEngine = lazy(() => import("./pages/AdminMatchingEngine"));
const PreviewParcoursDompe = lazy(() => import("./pages/PreviewParcoursDompe"));
const PreviewDemandeRemblai = lazy(() => import("./pages/PreviewDemandeRemblai"));
const AdminSoumissions = lazy(() => import("./pages/AdminSoumissions"));
const AdminNotifications = lazy(() => import("./pages/AdminNotifications"));
const AdminTerritories = lazy(() => import("./pages/AdminTerritories"));
const AdminSettings = lazy(() => import("./pages/AdminSettings"));
const AdminMonitoring = lazy(() => import("./pages/AdminMonitoring"));

const Catalogue = lazy(() => import("./pages/Catalogue"));
const Remblai = lazy(() => import("./pages/Remblai"));
const DepotMateriaux = lazy(() => import("./pages/DepotMateriaux"));
const Calculateur = lazy(() => import("./pages/Calculateur"));
const TypesCamions = lazy(() => import("./pages/TypesCamions"));
const TransportEnVrac = lazy(() => import("./pages/TransportEnVrac"));
const EntrepreneurComparateur = lazy(() => import("./pages/EntrepreneurComparateur"));
const CatalogueMateriau = lazy(() => import("./pages/CatalogueMateriau"));
const EntrepreneurAnnuaire = lazy(() => import("./pages/EntrepreneurAnnuaire"));
const Reseau = lazy(() => import("./pages/Reseau"));
const ReseauProfil = lazy(() => import("./pages/ReseauProfil"));
const PlaceDeMarche = lazy(() => import("./pages/PlaceDeMarche"));
const ObtenirSoumissions = lazy(() => import("./pages/ObtenirSoumissions"));
const MesSoumissions = lazy(() => import("./pages/MesSoumissions"));
const Notifications = lazy(() => import("./pages/Notifications"));
const TrouverEntrepreneur = lazy(() => import("./pages/TrouverEntrepreneur"));
const FicheEntrepreneur = lazy(() => import("./pages/FicheEntrepreneur"));
const AdminMarketplaceDeals = lazy(() => import("./pages/AdminMarketplaceDeals"));
const AdminMarketplaceAnalytics = lazy(() => import("./pages/AdminMarketplaceAnalytics"));
const AdminMarketplaceScores = lazy(() => import("./pages/AdminMarketplaceScores"));
const AdminMarketplaceAutomations = lazy(() => import("./pages/AdminMarketplaceAutomations"));
const AdminTransportRequests = lazy(() => import("./pages/AdminTransportRequests"));
const AdminBusinessIntelligence = lazy(() => import("./pages/AdminBusinessIntelligence"));
const AdminIntelligence = lazy(() => import("./pages/AdminIntelligence"));
const AdminDirection = lazy(() => import("./pages/AdminDirection"));
const AdminAiEconomy = lazy(() => import("./pages/AdminAiEconomy"));
const AdminGoogleIntegrations = lazy(() => import("./pages/AdminGoogleIntegrations"));
const AdminCrm = lazy(() => import("./pages/AdminCrm"));
const CrmDetail = lazy(() => import("./pages/CrmDetail"));
const AdminOperations = lazy(() => import("./pages/AdminOperations"));
const AdminJsc = lazy(() => import("./pages/AdminJsc"));
const AdminPlatformSettings = lazy(() => import("./pages/AdminPlatformSettings"));
const MonAbonnement = lazy(() => import("./pages/MonAbonnement"));
const OpsCenter = lazy(() => import("./pages/OpsCenter"));
const AdminIaCenter = lazy(() => import("./pages/AdminIaCenter"));
const AdminOrchestrator = lazy(() => import("./pages/AdminOrchestrator"));

const queryClient = new QueryClient();

const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [pathname]);
  return null;
};

const Ga4RouteTracker = () => {
  const location = useLocation();
  useEffect(() => {
    // Laisse le temps au titre de se mettre à jour (Helmet) avant d'envoyer le page_view.
    const t = window.setTimeout(() => {
      trackPageView(location.pathname + location.search, document.title);
    }, 50);
    return () => window.clearTimeout(t);
  }, [location.pathname, location.search]);
  return null;
};

/** Les espaces privés ne doivent jamais être indexables (en plus du robots.txt). */
const PRIVATE_PREFIXES = ["/admin", "/entrepreneur", "/ops", "/portail", "/chauffeur", "/login", "/reset-password", "/forgot-password", "/unsubscribe", "/mes-soumissions", "/notifications"];
const PrivateNoIndex = () => {
  const location = useLocation();
  const isPrivate = PRIVATE_PREFIXES.some((p) => location.pathname === p || location.pathname.startsWith(`${p}/`));
  if (!isPrivate) return null;
  return (
    <Helmet>
      <meta name="robots" content="noindex, nofollow" />
      <meta name="googlebot" content="noindex, nofollow" />
    </Helmet>
  );
};

const App = () => (
  <AppErrorBoundary>
    {/* Métadonnées par défaut : chaque page peut les remplacer avec son propre <Helmet>. */}
    <Helmet>
      <title>Vrac Québec | Terre, sable, gravier et remblai à Québec</title>
      <meta name="description" content="Plateforme de référence pour le vrac au Québec : matériaux, sites de dépôt (dompes), remblai et transport en vrac pour l'excavation et la construction." />
      <meta property="og:site_name" content="Vrac Québec" />
      <meta property="og:title" content="Vrac Québec | Terre, sable, gravier et remblai à Québec" />
      <meta property="og:description" content="Matériaux en vrac, dompes et transport pour vos chantiers dans la région de Québec." />
      <meta name="twitter:title" content="Vrac Québec | Terre, sable, gravier et remblai à Québec" />
      <meta name="twitter:description" content="Matériaux en vrac, dompes et transport pour vos chantiers dans la région de Québec." />
    </Helmet>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ScrollToTop />
          <PrivateNoIndex />
          <Ga4RouteTracker />
          <SessionKeeper />
          <AdminNotificationsMount />
          <UniversalNav />
          <Suspense fallback={null}>
          <EntrepreneurDataProvider>
          <Routes>
            {/* Fournisseur de données partagé de l'espace entrepreneur */}
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/donnees" element={<AdminData />} />
            <Route path="/admin/calendrier" element={<AdminCalendar />} />
            <Route path="/admin/flotte" element={<AdminFleet />} />
            <Route path="/admin/flotte/vehicule/:id" element={<AdminFleetVehicle />} />
            <Route path="/admin/marche/categories" element={<AdminMarketplaceCategories />} />
            <Route path="/admin/marche/jumelage" element={<AdminMarketplaceMatching />} />
            <Route path="/admin/marche/lots" element={<AdminMarketplaceLots />} />
            <Route path="/admin/marche/soumissions" element={<AdminMarketplaceRequests />} />
            <Route path="/admin/marche/commissions" element={<AdminMarketplaceCommissions />} />
            <Route path="/admin/marche/transactions" element={<AdminMarketplaceDeals />} />
            <Route path="/admin/marche/analytique" element={<AdminMarketplaceAnalytics />} />
            <Route path="/admin/marche/scores" element={<AdminMarketplaceScores />} />
            <Route path="/admin/marche/automatisations" element={<AdminMarketplaceAutomations />} />
            <Route path="/partenaire/profil" element={<PartenaireProfil />} />
            <Route path="/partenaire/soumissions" element={<PartenaireSoumissions />} />
            <Route path="/entrepreneur" element={<EntrepreneurDashboard />} />
            <Route path="/entrepreneur/carte" element={<Entrepreneur />} />
            <Route path="/entrepreneur/demandes" element={<EntrepreneurDemandes />} />
            <Route path="/entrepreneur/reseau" element={<EntrepreneurAnnuaire />} />
            <Route path="/entrepreneur/chantiers" element={<EntrepreneurChantiers />} />
            <Route path="/entrepreneur/chantiers/:key" element={<EntrepreneurChantierDetail />} />
            <Route path="/entrepreneur/favoris" element={<Navigate to="/entrepreneur" replace />} />
            <Route path="/entrepreneur/historique" element={<EntrepreneurHistorique />} />
            <Route path="/entrepreneur/compte" element={<EntrepreneurCompte />} />
            <Route path="/entrepreneur/abonnement" element={<MonAbonnement />} />
            <Route path="/entrepreneur/notifications" element={<EntrepreneurNotifications />} />
            <Route path="/entrepreneur/inscription" element={<EntrepreneurSignup />} />
            <Route path="/espace-entrepreneur" element={<EspaceEntrepreneur />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/recherche" element={<BlogSearch />} />
            <Route path="/blog/outils" element={<BlogTools />} />
            <Route path="/blog/outils/:tool" element={<BlogCalculator />} />
            <Route path="/blog/guides" element={<BlogGuides />} />
            <Route path="/blog/faq" element={<BlogFaq />} />
            <Route path="/blog/categorie/:slug" element={<BlogCategory />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            <Route path="/admin/blogue" element={<AdminBlog />} />
            <Route path="/admin/blogue/idees" element={<AdminBlogIdeas />} />
            <Route path="/admin/blogue/generer" element={<AdminBlogBatch />} />
            <Route path="/admin/blogue/maillage" element={<AdminBlogMesh />} />
            <Route path="/admin/blogue/editer/:id" element={<AdminBlogEditor />} />
            <Route path="/admin/liste-noire" element={<AdminBlacklist />} />
            <Route path="/admin/seo" element={<AdminSeoManager />} />
            <Route path="/demande-transport" element={<TransportRequest />} />
            <Route path="/portail/client" element={<ClientPortal />} />
            <Route path="/portail/chauffeur" element={<DriverPortal />} />
            <Route path="/soumission" element={<Soumission />} />
            <Route path="/acheter-materiaux" element={<AchatVrac />} />
            <Route path="/materiaux" element={<Catalogue />} />
            <Route path="/remblai" element={<Remblai />} />
            <Route path="/depot-materiaux" element={<DepotMateriaux />} />
            <Route path="/calculateur" element={<Calculateur />} />
            <Route path="/types-de-camions" element={<TypesCamions />} />
            <Route path="/transport-en-vrac" element={<TransportEnVrac />} />
            <Route path="/entrepreneur/comparateur" element={<EntrepreneurComparateur />} />
            <Route path="/materiaux/:slug" element={<CatalogueMateriau />} />
            <Route path="/reseau" element={<Reseau />} />
            <Route path="/reseau/:slug" element={<ReseauProfil />} />
            <Route path="/place-de-marche" element={<PlaceDeMarche />} />
            <Route path="/trouver-un-entrepreneur/fiche/:companyId" element={<FicheEntrepreneur />} />
            <Route path="/trouver-un-entrepreneur" element={<TrouverEntrepreneur />} />
            <Route path="/trouver-un-entrepreneur/:slug" element={<TrouverEntrepreneur />} />

            <Route path="/obtenir-des-soumissions" element={<ObtenirSoumissions />} />
            <Route path="/mes-soumissions" element={<MesSoumissions />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/admin/demandes-acces" element={<AdminTransportRequests />} />
            <Route path="/admin/demandes-transport" element={<Navigate to="/admin/demandes-acces" replace />} />
            <Route path="/admin/business-intelligence" element={<AdminBusinessIntelligence />} />
            <Route path="/admin/ai-economy" element={<AdminAiEconomy />} />
            <Route path="/admin/integrations-google" element={<AdminGoogleIntegrations />} />
            <Route path="/admin/crm" element={<AdminCrm />} />
            <Route path="/admin/crm/:ownerType/:id" element={<CrmDetail />} />
            <Route path="/admin/operations" element={<AdminOperations />} />
            <Route path="/admin/jsc" element={<AdminJsc />} />
            <Route path="/admin/plateforme" element={<AdminPlatformSettings />} />
            <Route path="/admin/configuration-soumissions" element={<AdminSoumissionConfig />} />
            <Route path="/admin/capacites-transport" element={<AdminTransportCapacities />} />
            <Route path="/admin/matching-lab" element={<AdminMatchingLab />} />
            <Route path="/admin/matching-simulation" element={<AdminMatchingSimulation />} />
            <Route path="/admin/qualification" element={<AdminMaterialQualification />} />
            <Route path="/admin/qualification-remblai" element={<AdminQualificationQueue />} />
            <Route path="/admin/offres-materiaux" element={<AdminMaterialOffers />} />
            <Route path="/admin/matching-engine" element={<AdminMatchingEngine />} />
            <Route path="/admin/apercu-parcours" element={<PreviewParcoursDompe />} />
            <Route path="/admin/apercu-besoin" element={<PreviewDemandeRemblai />} />
            <Route path="/admin/notifications" element={<AdminNotifications />} />
            <Route path="/admin/territoires" element={<AdminTerritories />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            <Route path="/admin/parametres" element={<Navigate to="/admin/settings" replace />} />
            <Route path="/admin/soumissions" element={<AdminSoumissions />} />
            <Route path="/admin/supervision" element={<AdminMonitoring />} />
            <Route path="/admin/centre-operations" element={<OpsCenter />} />
            <Route path="/admin/intelligence" element={<AdminIntelligence />} />
            <Route path="/admin/direction" element={<AdminDirection />} />
            <Route path="/admin/ia" element={<AdminIaCenter />} />
            <Route path="/admin/orchestrateur" element={<AdminOrchestrator />} />
            {/* Alias historique — redirige vers la route canonique */}
            <Route path="/admin/seo-manager" element={<Navigate to="/admin/seo" replace />} />
            <Route path="/livraison" element={<ZonesIndex />} />
            <Route path="/livraison/:citySlug" element={<ZoneCityIndex />} />
            {/* /404 doit rester AVANT /:localSlug, sinon la redirection de SeoLandingPage
                retombe sur elle-même et affiche une page vide. */}
            <Route path="/404" element={<NotFound />} />
            {/* Local SEO landing: MUST stay just before the catch-all route */}
            <Route path="/:localSlug" element={<SeoLandingPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </EntrepreneurDataProvider>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;
