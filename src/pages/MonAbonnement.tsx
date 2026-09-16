// ============================================================
// CRM-02 — « Mon abonnement » (entreprise, mode test).
// Le navigateur n'accorde jamais de droits : il affiche l'état du serveur.
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock, CreditCard, ExternalLink, FileText, Loader2, Receipt, RefreshCw, ShieldCheck } from "lucide-react";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import UniversalNav from "@/components/UniversalNav";
import { useAuthReady } from "@/hooks/useAuthReady";
import { getStripe, paymentsConfigured } from "@/lib/stripe";
import { describeCapabilities, NEVER_INCLUDED } from "@/lib/platform/capabilities";
import { invoiceTaxLabel, TAX_LABELS, TAX_TONES, taxGuidance } from "@/lib/platform/tax";
import {
  fetchSubscriptionStatus, formatAmount, formatDate, hasPaidAccess, openBillingPortal,
  resyncSubscription, startCheckout, stateGuidance, subscriptionState,
  STATE_LABELS, STATE_TONES, type SubscriptionStatusResponse,
} from "@/lib/platform/subscription";


const card = "rounded-xl border border-border bg-card p-4";

function TestBanner() {
  const token = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;
  if (!token) {
    return (
      <div className="w-full border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">
        Le paiement n'est pas configuré pour cette version.
      </div>
    );
  }
  if (token.startsWith("pk_test_")) {
    return (
      <div className="w-full border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-700">
        Environnement de test — aucun prélèvement réel. 10 CAD/mois — tarif de test.
      </div>
    );
  }

  return null;
}

export default function MonAbonnement() {
  const { user, isReady } = useAuthReady();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<SubscriptionStatusResponse | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState<string | null>(null);
  const [checkoutSecret, setCheckoutSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    try {
      setData(await fetchSubscriptionStatus());
      setState("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setState("error");
    }
  }, []);

  useEffect(() => {
    if (isReady && user) void load();
  }, [isReady, user, load]);

  // Retour de paiement : on revérifie l'état serveur, jamais l'URL seule.
  useEffect(() => {
    if (!params.get("session_id")) return;
    const next = new URLSearchParams(params);
    next.delete("session_id");
    setParams(next, { replace: true });
    const timer = setTimeout(() => void load(), 1500);
    toast.info("Paiement transmis. Vérification auprès du prestataire…");
    return () => clearTimeout(timer);
  }, [params, setParams, load]);

  if (!isReady) return <div className="min-h-dvh grid place-items-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!user) {
    return (
      <>
        <UniversalNav />
        <main className="mx-auto max-w-2xl p-4"><div className={card}>Connectez-vous pour consulter votre abonnement.</div></main>
      </>
    );
  }

  const sub = data?.subscription ?? null;
  const st = subscriptionState(sub);
  const offer = data?.offer ?? null;
  const canBill = data?.company?.canBill ?? false;

  const subscribe = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const url = `${window.location.origin}/entrepreneur/abonnement?session_id={CHECKOUT_SESSION_ID}`;
      const { clientSecret } = await startCheckout(url);
      setCheckoutSecret(clientSecret);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Paiement indisponible");
    } finally {
      setBusy(false);
    }
  };

  const portal = async () => {
    setBusy(true);
    try {
      const { url } = await openBillingPortal(`${window.location.origin}/entrepreneur/abonnement`);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Portail indisponible");
    } finally {
      setBusy(false);
    }
  };

  const resync = async () => {
    setBusy(true);
    try {
      await resyncSubscription(sub?.id);
      await load();
      toast.success("État resynchronisé avec le prestataire.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Resynchronisation impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <UniversalNav />
      <TestBanner />
      <main className="mx-auto w-full max-w-3xl space-y-4 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <header>
          <h1 className="font-display text-2xl font-bold">Mon abonnement</h1>
          <p className="text-sm text-muted-foreground">
            Facturation de l'entreprise {data?.company?.name ?? "—"}.
          </p>
        </header>

        {state === "loading" && (
          <div className={`${card} flex items-center gap-2 text-sm`}><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
        )}

        {state === "error" && (
          <div className={`${card} border-destructive/40 text-sm`}>
            <p className="flex items-center gap-2 font-medium text-destructive"><AlertTriangle className="h-4 w-4" /> Source non connectée</p>
            <p className="mt-1 text-muted-foreground">{error}</p>
            <button onClick={load} className="mt-3 min-h-[44px] rounded-lg border border-border px-3 text-sm">Réessayer</button>
          </div>
        )}

        {state === "ready" && data?.source === "not_connected" && (
          <div className={card}>
            <p className="text-sm">{data.reason}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Un abonnement appartient à une entreprise. Demandez votre rattachement pour gérer la facturation.
            </p>
          </div>
        )}

        {state === "ready" && data?.source === "ready" && (
          <>
            <section className={card}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-display text-lg font-semibold">{sub?.platform_plans?.name ?? offer?.name ?? "Aucun forfait"}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatAmount(sub?.amount_cents ?? offer?.price_cents ?? null, sub?.currency ?? offer?.currency ?? "CAD")} par mois
                    {offer?.is_test && " — tarif de test"}
                  </p>
                  {offer?.is_test && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Le tarif commercial d'Entrepreneur Pro reste « À définir ».
                    </p>
                  )}
                </div>

                <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATE_TONES[st]}`}>{STATE_LABELS[st]}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{stateGuidance(st)}</p>
              <dl className="mt-3 grid gap-3 sm:grid-cols-3 text-sm">
                <div><dt className="text-xs text-muted-foreground">Prochaine échéance</dt><dd>{formatDate(sub?.current_period_end)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Version du forfait</dt><dd>{sub?.plan_version ?? offer?.version ?? "—"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Dernière synchronisation</dt><dd>{formatDate(sub?.last_synced_at)}</dd></div>
              </dl>
              {sub?.cancel_at_period_end && (
                <p className="mt-2 text-sm text-indigo-700">Annulation programmée : accès maintenu jusqu'au {formatDate(sub.current_period_end)}.</p>
              )}
              {sub?.last_payment_failed_at && (
                <p className="mt-2 text-sm text-amber-700">Dernier échec de paiement le {formatDate(sub.last_payment_failed_at)}.</p>
              )}
            </section>

            <section className={card}>
              <h2 className="flex items-center gap-2 font-display font-semibold"><ShieldCheck className="h-4 w-4" /> Services inclus</h2>
              <ul className="mt-3 space-y-3">
                {describeCapabilities(sub?.platform_plans?.features ?? offer?.features ?? []).map((cap) => {
                  const open = cap.available && hasPaidAccess(sub);
                  return (
                    <li key={cap.key} className="rounded-lg border border-border/70 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 font-medium">
                            {cap.available
                              ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                              : <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />}
                            {cap.label}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">{cap.description}</p>
                          {!cap.available && (
                            <p className="mt-1 text-xs text-muted-foreground">{cap.unavailableReason}</p>
                          )}
                        </div>
                        {open && cap.route && (
                          <Link to={cap.route}
                            className="inline-flex min-h-[44px] shrink-0 items-center rounded-lg border border-border px-3 text-sm font-medium">
                            Ouvrir
                          </Link>
                        )}
                        {!cap.available && (
                          <span className="shrink-0 rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">À venir</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                L'abonnement n'ouvre jamais : {NEVER_INCLUDED.join(" · ")}.
              </p>
            </section>

            <section className={card}>
              <h2 className="flex items-center gap-2 font-display font-semibold"><Receipt className="h-4 w-4" /> Taxes</h2>
              {!data.tax && (
                <p className="mt-2 text-sm text-muted-foreground">
                  État des taxes non lu : aucune taxe n'est annoncée pour ce dossier.
                </p>
              )}
              {data.tax && (
                <>
                  <span className={`mt-2 inline-block rounded-full border px-3 py-1 text-xs font-medium ${TAX_TONES[data.tax.state]}`}>
                    {TAX_LABELS[data.tax.state]}
                  </span>
                  <p className="mt-2 text-sm text-muted-foreground">{taxGuidance(data.tax.state)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{data.tax.detail}</p>
                  <dl className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                    <div>Adresse du vendeur : {data.tax.sellerAddressConfigured ? "configurée" : "absente"}</div>
                    <div>Classification du service : {data.tax.serviceTaxCodeConfigured ? "configurée" : "absente"}</div>
                    <div>Inscriptions fiscales actives : {data.tax.registrations ?? "inconnu"}</div>
                    <div>Calcul actif sur l'abonnement : {data.tax.automaticTaxOnSubscription === null ? "inconnu" : data.tax.automaticTaxOnSubscription ? "oui" : "non"}</div>
                  </dl>
                </>
              )}
            </section>


            <section className={card}>
              <h2 className="flex items-center gap-2 font-display font-semibold"><CreditCard className="h-4 w-4" /> Gestion</h2>
              {!canBill && <p className="mt-2 text-sm text-muted-foreground">Votre rôle ne permet pas de gérer la facturation.</p>}
              {canBill && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {!hasPaidAccess(sub) && paymentsConfigured() && (
                    <button onClick={subscribe} disabled={busy}
                      className="min-h-[44px] rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">
                      {busy ? "…" : "S'abonner (test)"}
                    </button>
                  )}
                  {sub?.provider_subscription_id && (
                    <button onClick={portal} disabled={busy}
                      className="min-h-[44px] rounded-lg border border-border px-4 text-sm inline-flex items-center gap-2">
                      <ExternalLink className="h-4 w-4" /> Moyen de paiement et abonnement
                    </button>
                  )}
                  <button onClick={resync} disabled={busy}
                    className="min-h-[44px] rounded-lg border border-border px-4 text-sm inline-flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" /> Resynchroniser
                  </button>
                </div>
              )}
              {checkoutSecret && (
                <div className="mt-4">
                  <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret: async () => checkoutSecret }}>
                    <EmbeddedCheckout />
                  </EmbeddedCheckoutProvider>
                </div>
              )}
            </section>

            <section className={card}>
              <h2 className="flex items-center gap-2 font-display font-semibold"><FileText className="h-4 w-4" /> Factures</h2>
              {!data.invoices?.length && <p className="mt-2 text-sm text-muted-foreground">Aucune facture pour le moment.</p>}
              <ul className="mt-2 divide-y divide-border">
                {(data.invoices ?? []).map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span>{formatDate(inv.created)}</span>
                    <span>{formatAmount(inv.amount_paid, inv.currency.toUpperCase())}</span>
                    <span className="text-xs text-muted-foreground">
                      Taxes : {invoiceTaxLabel(inv.tax, inv.tax_status, inv.currency.toUpperCase())}
                    </span>
                    <span className="text-xs text-muted-foreground">{inv.status}</span>
                    {inv.hosted_invoice_url && (
                      <a href={inv.hosted_invoice_url} target="_blank" rel="noopener noreferrer"
                        className="min-h-[44px] inline-flex items-center text-primary underline">Voir</a>
                    )}
                  </li>
                ))}
              </ul>
            </section>

          </>
        )}
      </main>
    </>
  );
}
