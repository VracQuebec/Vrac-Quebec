// Lot 3 — services proposés au bon moment. Chaque bouton crée une demande concrète
// reliée au chantier; disponibilité, zone et accès sont vérifiés par l'équipe avant confirmation.
import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const SERVICE_KINDS = {
  pepine: { label: "Pépine avec opérateur", desc: "Polyvalente et mobile : étendre les matériaux, préparer le terrain, travaux compatibles (accès au terrain vérifié avant confirmation)." },
  camion_10: { label: "Camion 10 roues", desc: "Location avec chauffeur pour vos voyages." },
  camion_12: { label: "Camion 12 roues", desc: "Plus de capacité par voyage." },
  materiaux: { label: "Matériaux en vrac", desc: "Pierre, sable, terre du catalogue Vrac Québec, livrés." },
  preparation: { label: "Préparation du terrain", desc: "Avant la réception du remblai." },
  finition: { label: "Nivellement et finition", desc: "Une fois le remblai terminé." },
  analyse_sol: { label: "Analyse de sols", desc: "Documents et analyses déterminés selon le dossier. Aucun sol contaminé accepté." },
} as const;
export type ServiceKind = keyof typeof SERVICE_KINDS;

export default function ServiceOffers({ submissionId, kinds }: { submissionId?: string | null; kinds?: ServiceKind[] }) {
  const list = kinds ?? (Object.keys(SERVICE_KINDS) as ServiceKind[]);
  const [open, setOpen] = useState<ServiceKind | null>(null);
  const [note, setNote] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<ServiceKind[]>([]);

  const send = async () => {
    if (!open || busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("svc_request_create", { _kind: open, _sub: submissionId ?? (null as never), _note: note, _key: key });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Demande envoyée : l'équipe vérifie la disponibilité, la zone et l'accès avant de confirmer.");
    setDone((d) => [...d, open]); setOpen(null); setNote(""); setKey(crypto.randomUUID());
  };

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {list.map((k) => (
          <button key={k} type="button" onClick={() => setOpen(k)}
            className={`rounded-lg border p-3 text-left transition hover:border-primary ${open === k ? "border-primary" : "border-border"}`}>
            <p className="font-display text-sm font-bold">{done.includes(k) && <CheckCircle2 className="mr-1 inline h-4 w-4 text-primary" />}{SERVICE_KINDS[k].label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{SERVICE_KINDS[k].desc}</p>
          </button>
        ))}
      </div>
      {open && (
        <div className="space-y-2 rounded-lg border border-primary/40 p-3">
          <p className="text-sm font-semibold">Demander : {SERVICE_KINDS[open].label}</p>
          <Textarea maxLength={1000} placeholder="Précisions (dates, accès, quantité…) — facultatif" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => void send()}>{busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Envoyer la demande</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>Fermer</Button>
          </div>
        </div>
      )}
    </div>
  );
}
