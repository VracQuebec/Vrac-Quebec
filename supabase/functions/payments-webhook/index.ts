// CRM-02 — Réception des événements de facturation (signature vérifiée, environnement strict).
import { type StripeEnv, createStripeClient, verifyWebhook } from "../_shared/stripe.ts";
import { admin, applySubscription, markPaymentFailed, clearPaymentFailure } from "../_shared/subscription.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const rawEnv = new URL(req.url).searchParams.get("env");
  if (rawEnv !== "sandbox" && rawEnv !== "live") {
    return new Response(JSON.stringify({ received: true, ignored: "invalid env" }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }
  const env: StripeEnv = rawEnv;
  const db = admin();

  let event: { id: string; type: string; created?: number; data: { object: any } };
  try {
    event = await verifyWebhook(req, env);
  } catch (e) {
    console.error("Signature refusée:", e);
    return new Response("Webhook error", { status: 400 });
  }

  const object = event.data.object;
  const subscriptionId = object?.object === "subscription"
    ? object.id
    : object?.subscription ?? object?.parent?.subscription_details?.subscription ?? null;

  // Journalisation avant traitement : un événement n'est « traité » qu'après succès.
  const { data: logged, error: logError } = await db
    .from("platform_billing_events")
    .insert({
      environment: env,
      provider_event_id: event.id,
      event_type: event.type,
      provider_subscription_id: subscriptionId,
      company_id: object?.metadata?.companyId ?? null,
      event_created_at: event.created ? new Date(event.created * 1000).toISOString() : null,
      payload: object ?? {},
    })
    .select("id")
    .maybeSingle();

  if (logError) {
    // Doublon : déjà reçu, rien à refaire.
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed": {
        await applySubscription(object, env, event.created);
        break;
      }
      case "checkout.session.completed": {
        if (object.payment_status !== "unpaid" && subscriptionId) {
          const stripe = createStripeClient(env);
          const remote = await stripe.subscriptions.retrieve(subscriptionId);
          await applySubscription(remote, env, event.created);
        }
        break;
      }
      case "invoice.paid":
      case "invoice.payment_succeeded": {
        if (subscriptionId) {
          await clearPaymentFailure(subscriptionId, env);
          const stripe = createStripeClient(env);
          const remote = await stripe.subscriptions.retrieve(subscriptionId);
          await applySubscription(remote, env, event.created);
        }
        break;
      }
      case "invoice.payment_failed": {
        if (subscriptionId) await markPaymentFailed(subscriptionId, env);
        break;
      }
      default:
        break;
    }

    await db.from("platform_billing_events")
      .update({ status: "processed", processed_at: new Date().toISOString() })
      .eq("id", logged!.id);
  } catch (e) {
    await db.from("platform_billing_events")
      .update({ status: "error", error: e instanceof Error ? e.message : String(e) })
      .eq("id", logged!.id);
    console.error("Traitement échoué:", e);
    return new Response("Webhook error", { status: 400 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
