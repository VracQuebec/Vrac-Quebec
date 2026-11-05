import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { Eye } from "lucide-react";
import { isAdminReadonlyActive, logAdminReadonly } from "@/lib/admin-readonly/guard";
import { useUserRoles } from "@/hooks/useUserRole";

const ID_RE = /^([0-9a-f]{8}-[0-9a-f-]{27}|\d+)$/i;

/**
 * Journal de navigation du compte « Administration — Lecture seule ».
 * Enregistré côté navigateur : fiable pour l'ordre des écrans ouverts, mais un navigateur
 * modifié peut omettre des événements. Aucun contenu saisi n'est recopié (longueur seulement).
 */
export default function AdminReadonlyTracker() {
  const { isAdminReader } = useUserRoles();
  const loc = useLocation();
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!isAdminReader || !isAdminReadonlyActive()) return;
    if (!/^\/(admin|entrepreneur)/.test(loc.pathname)) return;
    const parts = loc.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex(p => ID_RE.test(p));
    if (idx > 0) logAdminReadonly("consultation_fiche", "/" + parts.slice(0, idx).join("/"), parts[idx - 1], parts[idx]);
    else logAdminReadonly("ouverture_section", loc.pathname);
    const keys = [...new URLSearchParams(loc.search).keys()];
    const recordId = new URLSearchParams(loc.search).get("id") ?? new URLSearchParams(loc.search).get("demande");
    if (recordId && ID_RE.test(recordId)) logAdminReadonly("consultation_fiche", loc.pathname, "parametre", recordId);
    if (keys.length) logAdminReadonly("recherche_filtre", loc.pathname, null, null, "reussi", { parametres: keys.slice(0, 10) });
  }, [loc.pathname, loc.search, isAdminReader]);

  useEffect(() => {
    if (!isAdminReader) return;
    const onInput = (e: Event) => {
      const el = e.target as HTMLInputElement | HTMLSelectElement;
      if (!el || !isAdminReadonlyActive()) return;
      const label = (el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.getAttribute("name") || "").slice(0, 60);
      const isSearch = el instanceof HTMLInputElement && (el.type === "search" || /recherch|search|filtr/i.test(label));
      const isFilter = el instanceof HTMLSelectElement;
      if (!isSearch && !isFilter) return;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => logAdminReadonly(isSearch ? "recherche" : "filtre", location.pathname, null, null, "reussi",
        isSearch ? { champ: label, longueur: (el as HTMLInputElement).value.length } : { champ: label }), 1200);
    };
    const onClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement)?.closest("button, [role=menuitem], [role=option], [role=tab], a");
      if (!btn || !isAdminReadonlyActive()) return;
      const text = (btn.textContent || btn.getAttribute("aria-label") || "").trim().slice(0, 60);
      if (btn.getAttribute("role") === "option") { logAdminReadonly("filtre", location.pathname, null, null, "reussi", { choix: text }); return; }
      if (/export|excel|csv|télécharg|telecharg|pdf|imprimer/i.test(text)) logAdminReadonly("export_ou_telechargement", location.pathname, null, null, "reussi", { libelle: text });
    };
    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onInput, true);
    document.addEventListener("click", onClick, true);
    return () => { document.removeEventListener("input", onInput, true); document.removeEventListener("change", onInput, true); document.removeEventListener("click", onClick, true); };
  }, [isAdminReader]);

  useEffect(() => {
    if (!isAdminReader) return;
    document.body.style.paddingBottom = "3rem"; // le bandeau ne masque aucune commande
    return () => { document.body.style.paddingBottom = ""; };
  }, [isAdminReader]);

  if (!isAdminReader) return null;
  return (
    <div role="note" className="fixed bottom-0 inset-x-0 z-[60] bg-secondary text-secondary-foreground border-t border-border text-xs px-3 py-1.5 flex items-center justify-center gap-2" style={{ paddingBottom: "max(0.375rem, env(safe-area-inset-bottom))" }}>
      <Eye className="h-3.5 w-3.5 shrink-0" />
      <span>Administration — Lecture seule. Les activités de ce compte professionnel (connexions, écrans et fiches ouverts, recherches, exports, actions refusées) sont journalisées.</span>
    </div>
  );
}
