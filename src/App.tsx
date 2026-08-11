import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { useEffect, lazy, Suspense } from "react";
import Index from "./pages/Index";
import SessionKeeper from "./components/SessionKeeper";
import AppErrorBoundary from "./components/AppErrorBoundary";
import UniversalNav from "./components/UniversalNav";
import { trackPageView } from "./lib/analytics/ga4";
import { useAdminNotifications } from "./hooks/useAdminNotifications";

function AdminNotificationsMount() {
  useAdminNotifications();
  return null;
}

const Login = lazy(() => import("./pages/Login"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminData = lazy(() => import("./pages/AdminData"));
const AdminCalendar = lazy(() => import("./pages/AdminCalendar"));
const Entrepreneur = lazy(() => import("./pages/Entrepreneur"));
const EntrepreneurDashboard = lazy(() => import("./pages/EntrepreneurDashboard"));
const EntrepreneurDemandes = lazy(() => import("./pages/EntrepreneurDemandes"));
const EntrepreneurFavoris = lazy(() => import("./pages/EntrepreneurFavoris"));
const EntrepreneurHistorique = lazy(() => import("./pages/EntrepreneurHistorique"));
const EntrepreneurCompte = lazy(() => import("./pages/EntrepreneurCompte"));
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
const AdminSoumissions = lazy(() => import("./pages/AdminSoumissions"));
const AdminMonitoring = lazy(() => import("./pages/AdminMonitoring"));

const Catalogue = lazy(() => import("./pages/Catalogue"));
const Remblai = lazy(() => import("./pages/Remblai"));
const DepotMateriaux = lazy(() => import("./pages/DepotMateriaux"));
const CatalogueMateriau = lazy(() => import("./pages/CatalogueMateriau"));
const Reseau = lazy(() => import("./pages/Reseau"));
const ReseauProfil = lazy(() => import("./pages/ReseauProfil"));
const PlaceDeMarche = lazy(() => import("./pages/PlaceDeMarche"));
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

const App = () => (
  <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ScrollToTop />
          <Ga4RouteTracker />
          <SessionKeeper />
          <AdminNotificationsMount />
          <UniversalNav />
          <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/donnees" element={<AdminData />} />
            <Route path="/admin/calendrier" element={<AdminCalendar />} />
            <Route path="/entrepreneur" element={<EntrepreneurDashboard />} />
            <Route path="/entrepreneur/carte" element={<Entrepreneur />} />
            <Route path="/entrepreneur/demandes" element={<EntrepreneurDemandes />} />
            <Route path="/entrepreneur/favoris" element={<EntrepreneurFavoris />} />
            <Route path="/entrepreneur/historique" element={<EntrepreneurHistorique />} />
            <Route path="/entrepreneur/compte" element={<EntrepreneurCompte />} />
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
            <Route path="/materiaux/:slug" element={<CatalogueMateriau />} />
            <Route path="/reseau" element={<Reseau />} />
            <Route path="/reseau/:slug" element={<ReseauProfil />} />
            <Route path="/place-de-marche" element={<PlaceDeMarche />} />
            <Route path="/admin/demandes-acces" element={<AdminTransportRequests />} />
            <Route path="/admin/demandes-transport" element={<Navigate to="/admin/demandes-acces" replace />} />
            <Route path="/admin/business-intelligence" element={<AdminBusinessIntelligence />} />
            <Route path="/admin/ai-economy" element={<AdminAiEconomy />} />
            <Route path="/admin/integrations-google" element={<AdminGoogleIntegrations />} />
            <Route path="/admin/crm" element={<AdminCrm />} />
            <Route path="/admin/crm/:ownerType/:id" element={<CrmDetail />} />
            <Route path="/admin/operations" element={<AdminOperations />} />
            <Route path="/admin/jsc" element={<AdminJsc />} />
            <Route path="/admin/configuration-soumissions" element={<AdminSoumissionConfig />} />
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
            {/* Local SEO landing: MUST stay just before the catch-all route */}
            <Route path="/:localSlug" element={<SeoLandingPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;
