import { useEffect, useState } from 'react';
import { photoDisplayUrl } from '@/lib/remblai/photo-display';

export default function ReceptionPhoto({ photo }: { photo: { name: string; preview: string } }) {
  const url = photoDisplayUrl(photo);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [url]);
  return url && !failed ? <img className="aspect-video w-full rounded-md object-cover" src={url} alt={photo.name} onError={() => setFailed(true)} /> : <p role="status" className="flex aspect-video items-center justify-center border border-border p-3 text-center text-sm text-muted-foreground">{photo.name} — photo privée indisponible.</p>;
}
