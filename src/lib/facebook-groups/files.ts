import { supabase } from "@/integrations/supabase/client";
import { readFileResponse, type FileProgress } from "@/lib/uploads/readProgress";

export type PublicationFile = { id: string; publication_id: string; bucket: string; path: string; name: string; mime: string; size: number };
export type FileJob = { id: string; uploaded: boolean };

export async function listPublicationFiles(publicationId: string): Promise<PublicationFile[]> {
  const { data, error } = await supabase.from("fb_publication_files").select("*").eq("publication_id", publicationId).order("created_at");
  if (error) throw error;
  return data ?? [];
}

/** Stable job survives partial failures; retry attaches the same original, never a second object. */
export async function attachPublicationFile(publicationId: string, file: File, job: FileJob) {
  const path = `facebook/${publicationId}/${job.id}`;
  if (!job.uploaded) {
    const { error } = await supabase.storage.from("crm-docs").upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
    if (error) {
      // A previous upload may have committed before its response was lost. Do not overwrite it.
      const { data, error: lookupError } = await supabase.storage.from("crm-docs").list(`facebook/${publicationId}`, { search: job.id });
      if (lookupError || !data?.some((entry) => entry.name === job.id)) throw error;
    }
    job.uploaded = true;
  }
  const { error } = await supabase.from("fb_publication_files").upsert({ id: job.id, publication_id: publicationId, path, name: file.name, mime: file.type || "application/octet-stream", size: file.size }, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw error;
}

/** Same authenticated Storage endpoint as secure-file; no reusable signature or cross-open cache. */
export async function readPublicationFile(file: PublicationFile, onProgress?: (value: FileProgress) => void): Promise<Blob> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Session expirée : reconnectez-vous.");
  const path = file.path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/authenticated/crm-docs/${path}?nocache=${crypto.randomUUID()}`, {
    cache: "no-store", headers: { Authorization: `Bearer ${data.session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
  });
  if (!response.ok) throw new Error(response.status === 401 ? "Session expirée : reconnectez-vous." : "Accès refusé ou fichier indisponible.");
  const blob = await readFileResponse(response, onProgress);
  // Only explicitly safe media types are rendered; other documents are downloaded.
  return blob.slice(0, blob.size, file.mime);
}