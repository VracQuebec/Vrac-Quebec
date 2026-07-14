import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useEffect, lazy, Suspense } from "react";
import Index from "./pages/Index";
import SessionKeeper from "./components/SessionKeeper";
import AppErrorBoundary from "./components/AppErrorBoundary";

const Login = lazy(() => import("./pages/Login"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminData = lazy(() => import("./pages/AdminData"));
const AdminCalendar = lazy(() => import("./pages/AdminCalendar"));
const Entrepreneur = lazy(() => import("./pages/Entrepreneur"));
const EntrepreneurSignup = lazy(() => import("./pages/EntrepreneurSignup"));
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
const BlogTools = lazy(() => import("./pages/BlogTools"));
const BlogCalculator = lazy(() => import("./pages/BlogCalculator"));
const BlogGuides = lazy(() => import("./pages/BlogGuides"));
const BlogFaq = lazy(() => import("./pages/BlogFaq"));
const AdminBlacklist = lazy(() => import("./pages/AdminBlacklist"));
const LocalIndex = lazy(() => import("./pages/LocalIndex"));
const LocalCityIndex = lazy(() => import("./pages/LocalCityIndex"));
const LocalLanding = lazy(() => import("./pages/LocalLanding"));

const queryClient = new QueryClient();

const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [pathname]);
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
          <SessionKeeper />
          <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/donnees" element={<AdminData />} />
            <Route path="/admin/calendrier" element={<AdminCalendar />} />
            <Route path="/entrepreneur" element={<Entrepreneur />} />
            <Route path="/entrepreneur/inscription" element={<EntrepreneurSignup />} />
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
            <Route path="/admin/blogue/editer/:id" element={<AdminBlogEditor />} />
            <Route path="/admin/liste-noire" element={<AdminBlacklist />} />
            <Route path="/livraison" element={<LocalIndex />} />
            <Route path="/livraison/:citySlug" element={<LocalCityIndex />} />
            {/* Local SEO landing: MUST stay just before the catch-all route */}
            <Route path="/:localSlug" element={<LocalLanding />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;
