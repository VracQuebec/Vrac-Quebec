// Case facultative, décochée par défaut, distincte des conditions d'utilisation.
// N'apparaît que si l'identité légale de l'expéditeur est complète (sinon aucun consentement valable).
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;
export type Sender = { legal_name: string | null; postal_address: string | null; contact: string | null; consent_text: string; consent_version: string };

export function useSender() {
  const [s, setS] = useState<Sender | null>(null);
  useEffect(() => { db.from("mkt_sender_identity").select("*").maybeSingle().then(({ data }: any) => setS(data)); }, []);
  return s;
}

export async function recordPromoConsent(email: string, source: string, version: string) {
  const { error } = await db.rpc("mkt_consent_record", { _email: email, _source: source, _version: version });
  return error?.message ?? null;
}

export default function PromoConsent({ checked, onChange, sender }: { checked: boolean; onChange: (v: boolean) => void; sender: Sender | null }) {
  if (!sender?.legal_name || !sender.postal_address || !sender.contact) return null;
  return (
    <div className="rounded-lg border border-border p-3 text-sm">
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>{sender.consent_text}</span>
      </label>
      <p className="mt-2 text-xs text-muted-foreground">Expéditeur : {sender.legal_name} · {sender.postal_address} · {sender.contact}. Facultatif : ne s'applique ni à Transport JSC ni aux entrepreneurs partenaires.</p>
    </div>
  );
}
