import { supabase } from "@/integrations/supabase/client";
import { setConsentRecorder, flushPendingConsent } from "./consent";

/** Inscription au registre : uniquement identifiant aléatoire, catégories, versions et source. */
setConsentRecorder(async ({ id, secret, analytics, banner, policy, source }) => {
  const { error } = await supabase.rpc("consent_record_choice", {
    p_consent_id: id, p_secret: secret, p_analytics: analytics,
    p_banner_version: banner, p_policy_version: policy, p_source: source,
    p_environment: /(^|\.)vracquebec\.ca$/.test(window.location.hostname) ? "publie" : "apercu",
  });
  if (error) throw new Error(error.message);
});

void flushPendingConsent();
