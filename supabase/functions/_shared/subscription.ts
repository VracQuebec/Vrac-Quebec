// CRM-02 — Écriture centralisée de l'état d'abonnement (serveur uniquement).
import { createClient } from "npm:@supabase/supabase-js@2";
import type { StripeEnv } from "./stripe.ts";

export function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

const iso = (unix?: number | null) => (unix ? new Date(unix * 1000).toISOString() : null);

/** Résout l'identifiant humain du prix (stable test/réel). */
export function priceRef(price: any): string | null {
  return price?.lookup_key ?? price?.metadata?.lovable_external_id ?? price?.id ?? null;
}

/**
 * Applique un objet Subscription Stripe sur platform_subscriptions.
 * Ignore un événement plus ancien que la dernière synchronisation (ordre inversé).
 */
export async function applySubscription(
  subscription: any,
  env: StripeEnv,
  eventAt?: number | null,
): Promise<{ applied: boolean; reason?: string }> {
  const db = admin();
  const companyId = subscription.metadata?.companyId ?? null;
  const planId = subscription.metadata?.planId ?? null;
  const planVersion = subscription.metadata?.planVersion ? Number(subscription.metadata.planVersion) : null;
  const item = subscription.items?.data?.[0];
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;
  const eventIso = iso(eventAt) ?? new Date().toISOString();

  const { data: existing } = await db
    .from("platform_subscriptions")
    .select("id, company_id, plan_id, plan_version, last_event_at, price_ref, amount_cents")
    .eq("provider_subscription_id", subscription.id)
    .maybeSingle();

  if (existing?.last_event_at && new Date(existing.last_event_at) > new Date(eventIso)) {
    return { applied: false, reason: "event plus ancien que l'état courant" };
  }

  const payload: Record<string, unknown> = {
    status: subscription.status,
    billing_status: subscription.status,
    provider: "stripe",
    environment: env,
    provider_subscription_id: subscription.id,
    provider_customer_id: typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? null,
    price_ref: priceRef(item?.price),
    amount_cents: item?.price?.unit_amount ?? existing?.amount_cents ?? null,
    currency: (item?.price?.currency ?? "cad").toUpperCase(),
    current_period_start: iso(periodStart),
    current_period_end: iso(periodEnd),
    cancel_at_period_end: !!subscription.cancel_at_period_end,
    cancel_at: iso(subscription.cancel_at),
    ended_at: iso(subscription.ended_at),
    last_event_at: eventIso,
    last_synced_at: new Date().toISOString(),
    last_error: null,
    is_test: env === "sandbox",
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    await db.from("platform_subscriptions").update(payload).eq("id", existing.id);
    return { applied: true };
  }

  if (!companyId || !planId) {
    return { applied: false, reason: "abonnement sans entreprise ou forfait identifié" };
  }

  await db.from("platform_subscriptions").insert({
    ...payload,
    company_id: companyId,
    plan_id: planId,
    plan_version: planVersion,
    started_at: iso(subscription.start_date) ?? new Date().toISOString(),
  });
  return { applied: true };
}

export async function markPaymentFailed(subscriptionId: string, env: StripeEnv) {
  const db = admin();
  await db
    .from("platform_subscriptions")
    .update({ last_payment_failed_at: new Date().toISOString(), last_synced_at: new Date().toISOString() })
    .eq("provider_subscription_id", subscriptionId)
    .eq("environment", env);
}

export async function clearPaymentFailure(subscriptionId: string, env: StripeEnv) {
  const db = admin();
  await db
    .from("platform_subscriptions")
    .update({ last_payment_failed_at: null, last_synced_at: new Date().toISOString() })
    .eq("provider_subscription_id", subscriptionId)
    .eq("environment", env);
}
