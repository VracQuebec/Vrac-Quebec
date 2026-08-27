// Lecture du réglage global « Notifications CRM » (Paramètres).
// Aucune notification n'est supprimée quand l'affichage est désactivé :
// les données restent intactes dans `crm_notifications`.
import { useEffect, useState } from "react";
import { fetchSettings } from "@/lib/notifications/api";

export function useCrmAlertsEnabled() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    let active = true;
    fetchSettings()
      .then((s) => { if (active) setEnabled(s.options?.crm_enabled !== false); })
      .catch(() => { /* réglage indisponible : comportement actuel conservé */ });
    return () => { active = false; };
  }, []);

  return enabled;
}
