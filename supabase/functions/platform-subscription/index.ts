// CRM-02 — API serveur de l'abonnement Vrac Québec (mode test).
// Le serveur détermine l'entreprise, le client de facturation et le prix autorisé.
// Aucune valeur de prix ou d'entreprise n'est acceptée depuis le navigateur.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";
import { admin, applySubscription } from "../_shared/subscription.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function parseEnv(value: unknown): StripeEnv {
  if (value === "sandbox" || value === "live") return value;
  throw new Error("Environnement de paiement invalide");
}

async function currentUser(req: Request) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) throw new Error("Non authentifié");
  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data.user) throw new Error("Non authentifié");
  return data.user;
}

/** Entreprise du membre connecté (jamais fournie par le navigateur). */
async function resolveCompany(userId: string) {
  const db = admin();
  const { data } = await db
    .from("jsc_company_members")
    .select("company_id, role, email, full_name, jsc_companies(name)")
    .eq("user_id", userId)
    .is("archived_at", null)
    .neq("is_active", false)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const BILLING_ROLES = ["proprietaire", "owner", "admin", "facturation", "comptabilite"];
  return {
    companyId: data.company_id as string,
    companyName: (data as any).jsc_companies?.name ?? null,
    role: data.role as string,
    canBill: BILLING_ROLES.includes(String(data.role)),
    email: (data.email as string | null) ?? null,
  };
}

/** Forfait autorisé pour l'environnement demandé : test isolé du catalogue commercial. */
async function resolvePlan(env: StripeEnv) {
  const db = admin();
  const { data } = await db
    .from("platform_plans")
    .select("*")
    .eq("status", "active")
    .eq("is_test", env === "sandbox")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data;
}

async function statusHandler(userId: string, env: StripeEnv) {
  const company = await resolveCompany(userId);
  if (!company) return { source: "not_connected", reason: "Aucune entreprise liée à ce compte." };
  const db = admin();
  const [{ data: sub }, plan] = await Promise.all([
    db.from("platform_subscriptions")
      .select("*, platform_plans(name, slug, features, billing_interval, is_test, version)")
      .eq("company_id", company.companyId)
      .eq("environment", env)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    resolvePlan(env),
  ]);

  let invoices: unknown[] = [];
  if (sub?.provider_customer_id) {
    try {
      const stripe = createStripeClient(env);
      const list = await stripe.invoices.list({ customer: sub.provider_customer_id, limit: 12 });
      invoices = list.data.map((i) => ({
        id: i.id,
        status: i.status,
        amount_paid: i.amount_paid,
        currency: i.currency,
        created: i.created ? new Date(i.created * 1000).toISOString() : null,
        hosted_invoice_url: i.hosted_invoice_url,
        pdf_url: i.invoice_pdf,
        tax: (i as any).total_taxes?.reduce?.((s: number, t: any) => s + (t.amount ?? 0), 0) ?? null,
      }));
    } catch (_e) {
      invoices = [];
    }
  }

  return {
    source: "ready",
    company: { id: company.companyId, name: company.companyName, role: company.role, canBill: company.canBill },
    environment: env,
    offer: plan
      ? {
          id: plan.id, name: plan.name, slug: plan.slug, version: plan.version,
          price_cents: plan.price_cents, currency: plan.currency,
          billing_interval: plan.billing_interval, features: plan.features,
          is_test: plan.is_test, tax_note: plan.tax_note,
        }
      : null,
    subscription: sub ?? null,
  };
}

async function checkoutHandler(user: { id: string; email?: string }, env: StripeEnv, returnUrl: string) {
  const company = await resolveCompany(user.id);
  if (!company) throw new Error("Aucune entreprise liée à ce compte.");
  if (!company.canBill) throw new Error("Seul un responsable de facturation peut souscrire.");

  const plan = await resolvePlan(env);
  if (!plan?.provider_price_id) throw new Error("Aucune offre disponible pour cet environnement.");

  const db = admin();
  const { data: existing } = await db
    .from("platform_subscriptions")
    .select("id, status, current_period_end")
    .eq("company_id", company.companyId)
    .eq("environment", env)
    .in("status", ["trialing", "active", "past_due", "incomplete"])
    .maybeSingle();
  if (existing && ["active", "trialing", "past_due"].includes(String(existing.status))) {
    throw new Error("Un abonnement est déjà actif pour cette entreprise.");
  }

  const stripe = createStripeClient(env);
  const prices = await stripe.prices.list({ lookup_keys: [plan.provider_price_id] });
  if (!prices.data.length) throw new Error("Prix introuvable chez le prestataire.");
  const price = prices.data[0];

  // Client de facturation résolu côté serveur et porteur des métadonnées.
  const found = await stripe.customers.search({
    query: `metadata['companyId']:'${company.companyId}'`, limit: 1,
  });
  const customerId = found.data.length
    ? found.data[0].id
    : (await stripe.customers.create({
        ...(company.email || user.email ? { email: company.email ?? user.email } : {}),
        name: company.companyName ?? undefined,
        metadata: { companyId: company.companyId, userId: user.id },
      })).id;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    ui_mode: "embedded_page",
    return_url: returnUrl,
    customer: customerId,
    line_items: [{ price: price.id, quantity: 1 }],
    automatic_tax: { enabled: true },
    customer_update: { address: "auto", name: "auto" },
    subscription_data: {
      metadata: {
        companyId: company.companyId,
        planId: plan.id,
        planVersion: String(plan.version ?? 1),
        priceRef: plan.provider_price_id,
        userId: user.id,
      },
    },
    metadata: { companyId: company.companyId, planId: plan.id, userId: user.id },
  });

  return { clientSecret: session.client_secret, sessionId: session.id };
}

async function portalHandler(userId: string, env: StripeEnv, returnUrl?: string) {
  const company = await resolveCompany(userId);
  if (!company?.canBill) throw new Error("Seul un responsable de facturation peut gérer la facturation.");
  const db = admin();
  const { data: sub } = await db
    .from("platform_subscriptions")
    .select("provider_customer_id")
    .eq("company_id", company.companyId)
    .eq("environment", env)
    .not("provider_customer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sub?.provider_customer_id) throw new Error("Aucun dossier de facturation à gérer.");
  const stripe = createStripeClient(env);
  const portal = await stripe.billingPortal.sessions.create({
    customer: sub.provider_customer_id,
    ...(returnUrl ? { return_url: returnUrl } : {}),
  });
  return { url: portal.url };
}

/** Réconciliation autorisée et journalisée : l'état du prestataire fait foi. */
async function syncHandler(userId: string, env: StripeEnv, subscriptionRowId?: string) {
  const db = admin();
  const { data: isAdmin } = await db.rpc("has_role", { _user_id: userId, _role: "admin" });
  let query = db.from("platform_subscriptions").select("id, company_id, provider_subscription_id").eq("environment", env);
  if (subscriptionRowId) query = query.eq("id", subscriptionRowId);
  if (!isAdmin) {
    const company = await resolveCompany(userId);
    if (!company?.canBill) throw new Error("Resynchronisation non autorisée.");
    query = query.eq("company_id", company.companyId);
  }
  const { data: rows } = await query;
  const stripe = createStripeClient(env);
  let synced = 0;
  for (const row of rows ?? []) {
    if (!row.provider_subscription_id) continue;
    const remote = await stripe.subscriptions.retrieve(row.provider_subscription_id);
    await applySubscription(remote, env, Math.floor(Date.now() / 1000));
    synced++;
  }
  await db.from("platform_change_log").insert({
    scope: "Abonnements", entity_table: "platform_subscriptions",
    entity_id: subscriptionRowId ?? null, action: "resync",
    changes: { environment: env, synced } as never, actor_id: userId,
  });
  return { synced };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const env = parseEnv(body.environment);
    const user = await currentUser(req);
    switch (body.action) {
      case "status":
        return json(await statusHandler(user.id, env));
      case "checkout":
        return json(await checkoutHandler({ id: user.id, email: user.email ?? undefined }, env, String(body.returnUrl ?? "")));
      case "portal":
        return json(await portalHandler(user.id, env, body.returnUrl ? String(body.returnUrl) : undefined));
      case "sync":
        return json(await syncHandler(user.id, env, body.subscriptionId ? String(body.subscriptionId) : undefined));
      default:
        return json({ error: "Action inconnue" }, 400);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erreur inattendue" }, 400);
  }
});
