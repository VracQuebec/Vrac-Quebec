import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Admin from "./pages/Admin";
import AdminData from "./pages/AdminData";
import Entrepreneur from "./pages/Entrepreneur";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [pathname]);
  return null;
};

// When the user did NOT check "Rester connecté", end the session
// as soon as the tab/window is closed. Otherwise, the Supabase client
// persists the session in localStorage and auto-refreshes the token
// so the admin stays logged in for days/weeks across refreshes.
const SessionLifetimeManager = () => {
  useEffect(() => {
    const onPageHide = () => {
      try {
        if (localStorage.getItem("vq_stay_logged_in") === "0") {
          supabase.auth.signOut();
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);
  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ScrollToTop />
        <SessionLifetimeManager />
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/donnees" element={<AdminData />} />
          <Route path="/entrepreneur" element={<Entrepreneur />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
