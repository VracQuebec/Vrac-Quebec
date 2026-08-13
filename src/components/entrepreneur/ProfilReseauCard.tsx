// ============================================================
// « MON PROFIL RÉSEAU » — V1, mobile-first, lecture seule.
// N'affiche que des informations réellement enregistrées.
// Aucun annuaire public : la visibilité réseau est seulement annoncée.
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { Building2, Eye, EyeOff, Loader2, Lock, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadMyProfil, isNetworkVisible, type ProfilResult } from "@/lib/parcours/profil";
import { localisationLabel } from "@/lib/parcours/localisation";
import ProfilEditForm from "@/components/entrepreneur/ProfilEditForm";

export default function ProfilReseauCard() {
  const [res, setRes] = useState<ProfilResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setRes(await loadMyProfil());
    setLoading(false);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  return (
    <section aria-labelledby="profil-reseau" className="mb-8">
      <h2 id="profil-reseau" className="mb-3 font-display text-lg font-bold sm:text-xl">
        Mon profil réseau
      </h2>

      {loading ? (
        <p className="flex items-center gap-2 font-body text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Chargement de votre profil…
        </p>
      ) : res?.state === "unauthorized" ? (
        <p className="font-body text-sm text-muted-foreground">
          Connectez-vous avec votre compte entrepreneur pour voir votre profil.
        </p>
      ) : res?.state === "ok" ? (
        <div className="rounded-xl border border-border bg-card p-4">
          {res.profil.missing ? (
            <p className="font-body text-sm text-muted-foreground">
              Aucune fiche entreprise n'est encore associée à votre compte. Votre profil réseau sera
              disponible dès qu'une fiche existera.
            </p>
          ) : editing ? (
            <ProfilEditForm
              initial={res.profil.edits}
              onCancel={() => setEditing(false)}
              onSaved={async () => { setEditing(false); setSaved(true); await reload(); }}
            />
          ) : (
            <>
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Building2 className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-base font-bold leading-tight">
                    {res.profil.company ?? "Entreprise à compléter"}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 font-body text-xs text-muted-foreground">
                    {isNetworkVisible(res.profil) ? (
                      <><Eye className="h-3.5 w-3.5" aria-hidden /> Visible dans le réseau</>
                    ) : (
                      <><EyeOff className="h-3.5 w-3.5" aria-hidden /> Non visible dans le réseau</>
                    )}
                  </p>
                </div>
              </div>

              {res.profil.incomplete ? (
                <p className="mt-3 rounded-lg bg-muted p-3 font-body text-xs text-muted-foreground">
                  Profil incomplet : le nom de votre entreprise n'est pas enregistré. Utilisez
                  « Modifier mon profil » pour le compléter.
                </p>
              ) : null}

              {saved ? (
                <p role="status" className="mt-3 rounded-lg bg-primary/10 p-3 font-body text-xs text-primary">
                  Profil enregistré.
                </p>
              ) : null}

              {res.profil.fields.length ? (
                <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {res.profil.fields.map((f) => (
                    <div key={f.key} className="rounded-lg border border-border/70 p-3">
                      <dt className="font-body text-[11px] uppercase tracking-wide text-muted-foreground">
                        {f.label}
                        {f.visibility === "self" ? (
                          <Lock className="ml-1 inline h-3 w-3" aria-label="Visible par vous seulement" />
                        ) : null}
                      </dt>
                      <dd className="font-body text-sm">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-3 font-body text-sm text-muted-foreground">
                  Aucune information professionnelle enregistrée pour le moment.
                </p>
              )}

              <div className="mt-4 rounded-lg border border-border/70 p-3">
                <p className="flex items-center gap-1.5 font-body text-[11px] uppercase tracking-wide text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" aria-hidden /> Localisation réseau
                </p>
                {res.profil.localisation.status === "reliable" ||
                res.profil.localisation.status === "partial" ? (
                  <p className="mt-1 font-body text-sm">
                    {localisationLabel(res.profil.localisation) ?? "Localisation partielle"}
                    {res.profil.publicLocalisation.postalSector ? (
                      <span className="text-muted-foreground">
                        {" "}· secteur {res.profil.publicLocalisation.postalSector}
                      </span>
                    ) : null}
                  </p>
                ) : null}
                <p className="mt-1 font-body text-xs text-muted-foreground">
                  {res.profil.localisation.message}
                </p>
                <p className="mt-1 font-body text-[11px] text-muted-foreground">
                  Seuls la ville, la province et le secteur pourront être partagés : votre adresse
                  complète reste privée.
                </p>
              </div>

              {res.profil.demandes != null && res.profil.chantiers != null ? (
                <p className="mt-4 font-body text-xs text-muted-foreground">
                  {res.profil.demandes} demande{res.profil.demandes > 1 ? "s" : ""} ·{" "}
                  {res.profil.chantiers} chantier{res.profil.chantiers > 1 ? "s" : ""}
                </p>
              ) : null}

              <p className="mt-3 font-body text-[11px] text-muted-foreground">
                Vos coordonnées personnelles ne sont jamais partagées : Vrac Québec reste votre seul
                interlocuteur.
              </p>

              <Button
                variant="outline"
                className="mt-3 h-11 w-full sm:w-auto"
                onClick={() => { setSaved(false); setEditing(true); }}
              >
                Modifier mon profil
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="font-body text-sm text-muted-foreground">
            Votre profil n'a pas pu être chargé. Aucune information n'est affichée afin d'éviter
            toute donnée erronée.
          </p>
          <Button variant="outline" className="mt-3 h-10" onClick={() => void reload()}>
            Réessayer
          </Button>
        </div>
      )}
    </section>
  );
}
