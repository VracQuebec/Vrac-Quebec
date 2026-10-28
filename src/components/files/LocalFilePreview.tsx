import { useEffect, useState } from "react";

/** Une URL locale par fichier, libérée au remplacement et à la fermeture. */
export default function LocalFilePreview({ file, className }: { file: File; className?: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url ? <img src={url} alt={file.name} decoding="async" className={className} /> : null;
}