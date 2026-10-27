// Téléchargement contrôlé : chaque ouverture repasse par la fonction secure-file, qui
// revérifie la session et les droits. Aucun lien signé réutilisable n'est créé.
import { supabase } from "@/integrations/supabase/client";

export type SecureBucket = "company-docs" | "asr-files";

export class SecureFileError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function secureFileMessage(status: number): string {
  if (status === 401) return "Session expirée : reconnectez-vous.";
  if (status === 403) return "Accès refusé : ce document n’est plus accessible avec votre compte.";
  if (status === 400) return "Document invalide.";
  return "Document temporairement indisponible.";
}

export async function fetchSecureFile(bucket: SecureBucket, path: string, mime?: string | null): Promise<Blob> {
  const { data: s } = await supabase.auth.getSession();
  const token = s.session?.access_token;
  if (!token) throw new SecureFileError(401, secureFileMessage(401));
  const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/secure-file`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST", cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ bucket, path }),
    });
  } catch { throw new SecureFileError(0, secureFileMessage(0)); }
  if (!res.ok) throw new SecureFileError(res.status, secureFileMessage(res.status));
  const b = await res.blob();
  return mime ? new Blob([b], { type: mime }) : b;
}
