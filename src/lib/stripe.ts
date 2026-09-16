// CRM-02 — Chargement du prestataire de paiement côté navigateur.
// L'environnement est déduit du préfixe du jeton public : jamais « live » par défaut.
import { loadStripe, type Stripe } from "@stripe/stripe-js";

export type StripeEnv = "sandbox" | "live";

const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

export function paymentsEnvironment(): StripeEnv {
  if (clientToken?.startsWith("pk_test_")) return "sandbox";
  if (clientToken?.startsWith("pk_live_")) return "live";
  throw new Error(
    "Les paiements ne sont pas configurés pour cette version. Terminez la mise en service pour activer le paiement réel.",
  );
}

export const paymentsConfigured = () =>
  !!clientToken && (clientToken.startsWith("pk_test_") || clientToken.startsWith("pk_live_"));

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    paymentsEnvironment();
    stripePromise = loadStripe(clientToken as string);
  }
  return stripePromise;
}
