import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Le bucket « lead-photos » est privé : les photos ne sont visibles que par
// les administrateurs via une URL signée temporaire.
const BUCKET = "lead-photos";

function toStoragePath(url: string): string | null {
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return url.startsWith("http") ? null : url;
  return decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
}

export const LeadPhotos = ({ photos }: { photos: string[] }) => {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    const paths = photos.map(toStoragePath).filter((p): p is string => Boolean(p));
    if (paths.length === 0) { setUrls([]); return; }
    supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, 60 * 60)
      .then(({ data }) => {
        if (!active) return;
        setUrls((data || []).map((d) => d.signedUrl).filter(Boolean) as string[]);
      });
    return () => { active = false; };
  }, [photos]);

  if (urls.length === 0) return null;

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {urls.map((url) => (
        <a key={url} href={url} target="_blank" rel="noreferrer">
          <img src={url} alt="Photo de la demande" className="w-full h-24 object-cover rounded" />
        </a>
      ))}
    </div>
  );
};