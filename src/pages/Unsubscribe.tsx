import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type State = "loading" | "valid" | "already" | "invalid" | "submitting" | "done" | "error";

const Unsubscribe = () => {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    (async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
          { headers: { apikey: SUPABASE_ANON_KEY } }
        );
        const data = await res.json();
        if (data.valid) setState("valid");
        else if (data.reason === "already_unsubscribed") setState("already");
        else setState("invalid");
      } catch {
        setState("error");
      }
    })();
  }, [token]);

  const confirm = async () => {
    if (!token) return;
    setState("submitting");
    try {
      const { data, error } = await supabase.functions.invoke("handle-email-unsubscribe", { body: { token } });
      if (error) throw error;
      if (data?.success || data?.reason === "already_unsubscribed") setState("done");
      else setState("error");
    } catch {
      setState("error");
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-4 bg-card p-8 rounded-xl border">
        <h1 className="text-2xl font-bold">Désabonnement</h1>
        {state === "loading" && <p className="text-muted-foreground">Vérification du lien…</p>}
        {state === "valid" && (
          <>
            <p>Confirmez-vous votre désabonnement de nos courriels?</p>
            <Button onClick={confirm}>Confirmer le désabonnement</Button>
          </>
        )}
        {state === "submitting" && <p>Traitement en cours…</p>}
        {state === "done" && <p>Vous avez été désabonné avec succès.</p>}
        {state === "already" && <p>Cette adresse est déjà désabonnée.</p>}
        {state === "invalid" && <p>Lien invalide ou expiré.</p>}
        {state === "error" && <p className="text-destructive">Une erreur est survenue. Réessayez plus tard.</p>}
      </div>
    </main>
  );
};

export default Unsubscribe;