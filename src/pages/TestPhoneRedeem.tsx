import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/** Aperçu seulement : ouvre la session fictive TEST A à partir d'un lien à usage unique. */
export default function TestPhoneRedeem() {
  const nav = useNavigate();
  const [msg, setMsg] = useState("Connexion au compte TEST…");
  useEffect(() => {
    const t = new URLSearchParams(window.location.hash.slice(1)).get("t");
    // Retirer le jeton de l'adresse avant tout autre traitement.
    window.history.replaceState(null, "", "/essai-telephone");
    if (!t) { setMsg("Lien invalide."); return; }
    (async () => {
      const { data, error } = await supabase.functions.invoke("test-phone-link", { body: { action: "redeem", token: t } });
      if (error || !data?.token_hash) { setMsg("Lien expiré ou déjà utilisé. Demandez un nouveau code QR."); return; }
      await supabase.auth.signOut({ scope: "local" });
      const v = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: "magiclink" });
      if (v.error) { setMsg("Connexion refusée. Demandez un nouveau code QR."); return; }
      nav("/entrepreneur/crm?tab=clients", { replace: true });
    })();
  }, [nav]);
  return <main className="container mx-auto max-w-md px-4 py-16 font-body"><p role="status">{msg}</p></main>;
}
