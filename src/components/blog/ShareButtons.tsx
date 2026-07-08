import { Facebook, Twitter, Linkedin, Link as LinkIcon, Mail } from "lucide-react";
import { toast } from "sonner";
import { shareUrls } from "@/lib/blog/utils";

type Props = { url: string; title: string };

export default function ShareButtons({ url, title }: Props) {
  const urls = shareUrls(url, title);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Lien copié");
    } catch {
      toast.error("Impossible de copier");
    }
  };
  const btn = "inline-flex items-center justify-center w-10 h-10 rounded-full border border-border bg-card hover:bg-muted transition";
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground font-body mr-1">Partager :</span>
      <a href={urls.facebook} target="_blank" rel="noopener noreferrer" aria-label="Partager sur Facebook" className={btn}>
        <Facebook className="w-4 h-4 text-[#1877F2]" />
      </a>
      <a href={urls.twitter} target="_blank" rel="noopener noreferrer" aria-label="Partager sur X" className={btn}>
        <Twitter className="w-4 h-4" />
      </a>
      <a href={urls.linkedin} target="_blank" rel="noopener noreferrer" aria-label="Partager sur LinkedIn" className={btn}>
        <Linkedin className="w-4 h-4 text-[#0A66C2]" />
      </a>
      <a href={urls.email} aria-label="Partager par courriel" className={btn}>
        <Mail className="w-4 h-4" />
      </a>
      <button type="button" onClick={onCopy} aria-label="Copier le lien" className={btn}>
        <LinkIcon className="w-4 h-4" />
      </button>
    </div>
  );
}