import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthReady } from "@/hooks/useAuthReady";

/**
 * Empêche un visiteur non connecté de voir l'interface des pages /admin.
 * Ne remplace pas les contrôles serveur (RLS/RPC) et ne change aucun droit métier :
 * il redirige seulement les sessions absentes vers la connexion.
 */
export default function AdminSignedOutGuard({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { user, isReady } = useAuthReady();
  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");
  if (!isAdminPath) return <>{children}</>;
  if (!isReady) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
