import { useState } from "react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";

/** Aperçu seulement : code QR d'un lien à usage unique vers le compte TEST A, pour un téléphone. */
export default function AdminTestPhone() {
  const { user, isReady } = useAuthReady();
  const { isAdmin, loading } = useUserRoles(user, isReady);
  const [qr, setQr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (!import.meta.env.DEV) return <p className="p-6">Indisponible.</p>;
  if (loading || !isReady) return <p className="p-6">Chargement…</p>;
  if (!isAdmin) return <p className="p-6">Réservé à l'administration.</p>;

  const make = async () => {
    setMsg(null); setQr(null);
    const { data, error } = await supabase.functions.invoke("test-phone-link", { method: "POST" });
    if (error || !data?.link) { setMsg("Lien non créé. La fonction n'est peut-être pas encore installée."); return; }
    setQr(await QRCode.toDataURL(data.link, { margin: 1, width: 280 }));
    setTimeout(() => setQr(null), 120000);
  };

  return <main className="container mx-auto max-w-md space-y-4 px-4 py-10 font-body">
    <h1 className="font-display text-2xl font-bold">Essai téléphone — compte TEST A</h1>
    <p className="text-sm text-muted-foreground">Ouvre la session fictive test-a-proprietaire@test.invalid sur votre téléphone. Lien à usage unique, sans mot de passe; le code disparaît après 2 minutes. Ne le partagez pas.</p>
    <Button onClick={make}>Afficher le code QR</Button>
    {qr && <img src={qr} alt="Code QR de connexion TEST" className="rounded-lg border border-border" />}
    {msg && <p className="text-sm text-destructive">{msg}</p>}
  </main>;
}
