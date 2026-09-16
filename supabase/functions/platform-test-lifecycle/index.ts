// ============================================================
// CRM-02B — Trousse de vérification du cycle d'abonnement.
// ENVIRONNEMENT DE TEST UNIQUEMENT (sandbox). Réservée aux administrateurs.
// Ne touche jamais à un dossier métier réel : elle crée des identités
// fictives isolées et pilote une horloge de test chez le prestataire.
// ============================================================
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createStripeClient } from "../_shared/stripe.ts";
import { admin, applySubscription } from "../_shared/subscription.ts";

const ENV = "sandbox" as const;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function requireAdmin(req: Request) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) throw new Error("Non authentifié");
  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data.user) throw new Error("Non authentifié");
  const db = admin();
  const { data: isAdmin } = await db.rpc("has_role", { _user_id: data.user.id, _role: "admin" });
  if (!isAdmin) throw new Error("Réservé à l'administration");
  return data.user;
}

/** Comptes fictifs isolés : domaine non routable, aucune invitation envoyée. */
const TEST_ACCOUNTS = [
  { key: "A_owner", email: "test-a-proprietaire@test.invalid", role: "proprietaire", company: "TESTA" },
  { key: "A_member", email: "test-a-operateur@test.invalid", role: "operateur", company: "TESTA" },
  { key: "B_owner", email: "test-b-proprietaire@test.invalid", role: "proprietaire", company: "TESTB" },
];

async function ensureAccounts(password: string) {
  const db = admin();
  const { data: companies } = await db.from("jsc_companies").select("id, code").in("code", ["TESTA", "TESTB"]);
  const byCode = new Map((companies ?? []).map((c: any) => [c.code, c.id]));
  const out: Record<string, unknown> = {};

  for (const acc of TEST_ACCOUNTS) {
    const companyId = byCode.get(acc.company);
    if (!companyId) throw new Error(`Entreprise de test ${acc.company} absente`);

    const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
    let user = list.users.find((u) => u.email === acc.email) ?? null;
    if (!user) {
      const { data: created, error } = await db.auth.admin.createUser({
        email: acc.email,
        password,
        email_confirm: true,
        user_metadata: { fictif: true, usage: "verification_abonnement" },
      });
      if (error) throw new Error(`Création ${acc.email} : ${error.message}`);
      user = created.user;
    } else {
      await db.auth.admin.updateUserById(user.id, { password });
    }

    const { data: member } = await db
      .from("jsc_company_members")
      .select("id")
      .eq("company_id", companyId)
      .eq("user_id", user!.id)
      .maybeSingle();
    if (!member) {
      await db.from("jsc_company_members").insert({
        company_id: companyId, user_id: user!.id, email: acc.email,
        full_name: `Compte fictif ${acc.key}`, role: acc.role, is_active: true,
      });
    }
    out[acc.key] = { userId: user!.id, email: acc.email, companyId, role: acc.role };
  }
  return out;
}

async function testPlan() {
  const db = admin();
  const { data } = await db.from("platform_plans").select("*").eq("is_test", true).eq("status", "active").limit(1).maybeSingle();
  if (!data?.provider_price_id) throw new Error("Forfait de test introuvable");
  return data;
}

async function priceId(stripe: any, lookup: string) {
  const prices = await stripe.prices.list({ lookup_keys: [lookup] });
  if (!prices.data.length) throw new Error("Prix de test introuvable");
  return prices.data[0].id;
}

/** Abonnement dédié à la simulation temporelle, rattaché à une horloge de test. */
async function clockSetup(companyCode: string) {
  const db = admin();
  const stripe = createStripeClient(ENV);
  const plan = await testPlan();
  const { data: company } = await db.from("jsc_companies").select("id, name").eq("code", companyCode).maybeSingle();
  if (!company) throw new Error("Entreprise de test introuvable");

  const clock = await stripe.testHelpers.testClocks.create({
    frozen_time: Math.floor(Date.now() / 1000),
    name: `CRM-02B ${companyCode}`,
  });
  const customer = await stripe.customers.create({
    name: company.name,
    email: `test-${companyCode.toLowerCase()}@test.invalid`,
    test_clock: clock.id,
    address: { country: "CA", postal_code: "G1A 0A1", state: "QC", city: "Québec", line1: "1 rue de Test" },
    metadata: { companyId: company.id, fictif: "true" },
  });
  const pm = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id });
  await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: pm.id } });

  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: await priceId(stripe, plan.provider_price_id) }],
    metadata: { companyId: company.id, planId: plan.id, planVersion: String(plan.version ?? 1), fictif: "true" },
    expand: ["latest_invoice"],
  });
  await applySubscription(subscription, ENV, Math.floor(Date.now() / 1000));

  return {
    clockId: clock.id, customerId: customer.id, subscriptionId: subscription.id,
    status: subscription.status,
    firstInvoice: {
      id: (subscription.latest_invoice as any)?.id,
      status: (subscription.latest_invoice as any)?.status,
      amount_paid: (subscription.latest_invoice as any)?.amount_paid,
    },
  };
}

async function waitClock(stripe: any, clockId: string) {
  for (let i = 0; i < 40; i++) {
    const c = await stripe.testHelpers.testClocks.retrieve(clockId);
    if (c.status === "ready") return c;
    if (c.status === "internal_failure") throw new Error("Horloge de test en échec");
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Horloge de test toujours en cours d'avancement");
}

/** Avance l'horloge et resynchronise l'application depuis l'état du prestataire. */
async function advance(clockId: string, subscriptionId: string, seconds: number) {
  const stripe = createStripeClient(ENV);
  const clock = await stripe.testHelpers.testClocks.retrieve(clockId);
  await stripe.testHelpers.testClocks.advance({ frozen_time: clock.frozen_time + seconds } as any, {
    // deno-lint-ignore no-explicit-any
  } as any).catch(async () => {
    await (stripe.testHelpers.testClocks as any).advance(clockId, { frozen_time: clock.frozen_time + seconds });
  });
  await waitClock(stripe, clockId);
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  await applySubscription(sub, ENV, Math.floor(Date.now() / 1000));
  const invoices = await stripe.invoices.list({ subscription: subscriptionId, limit: 10 });
  return {
    status: sub.status,
    current_period_end: sub.items.data[0]?.current_period_end ?? sub.current_period_end,
    invoices: invoices.data.map((i: any) => ({ id: i.id, status: i.status, amount_paid: i.amount_paid, attempted: i.attempted })),
  };
}

async function setCard(customerId: string, card: string) {
  const stripe = createStripeClient(ENV);
  const pm = await stripe.paymentMethods.attach(card, { customer: customerId });
  await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: pm.id } });
  return { defaultPaymentMethod: pm.id, card };
}

async function payOpen(subscriptionId: string) {
  const stripe = createStripeClient(ENV);
  const invoices = await stripe.invoices.list({ subscription: subscriptionId, status: "open", limit: 5 });
  const results = [];
  for (const inv of invoices.data) {
    const paid = await stripe.invoices.pay(inv.id);
    results.push({ id: paid.id, status: paid.status, amount_paid: paid.amount_paid });
  }
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  await applySubscription(sub, ENV, Math.floor(Date.now() / 1000));
  return { status: sub.status, paid: results };
}

async function cancelAtPeriodEnd(subscriptionId: string) {
  const stripe = createStripeClient(ENV);
  const sub = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
  await applySubscription(sub, ENV, Math.floor(Date.now() / 1000));
  return { status: sub.status, cancel_at_period_end: sub.cancel_at_period_end };
}

/** Deux tentatives simultanées : une seule réservation doit aboutir. */
async function concurrent(companyCode: string) {
  const db = admin();
  const { data: company } = await db.from("jsc_companies").select("id").eq("code", companyCode).maybeSingle();
  if (!company) throw new Error("Entreprise de test introuvable");
  const plan = await testPlan();

  const attempt = async (tag: string) => {
    const { error } = await db.from("platform_subscriptions").insert({
      company_id: company.id, plan_id: plan.id, status: "incomplete", billing_status: "reservation",
      environment: ENV, provider: "stripe", currency: "CAD", amount_cents: plan.price_cents,
      is_test: true, started_at: new Date().toISOString(),
    });
    return { tag, reserved: !error, reason: error?.message ?? null };
  };
  const [one, two] = await Promise.all([attempt("session-1"), attempt("session-2")]);
  const { count } = await db
    .from("platform_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("company_id", company.id)
    .eq("environment", ENV)
    .in("status", ["incomplete", "trialing", "active", "past_due"]);
  return { attempts: [one, two], billableRows: count ?? 0 };
}

/** Nettoyage des réservations fictives créées par le test de concurrence. */
async function cleanupReservations(companyCode: string) {
  const db = admin();
  const { data: company } = await db.from("jsc_companies").select("id").eq("code", companyCode).maybeSingle();
  if (!company) throw new Error("Entreprise de test introuvable");
  const { data } = await db
    .from("platform_subscriptions")
    .delete()
    .eq("company_id", company.id)
    .eq("environment", ENV)
    .eq("billing_status", "reservation")
    .is("provider_subscription_id", null)
    .select("id");
  return { removed: data?.length ?? 0 };
}

async function state(companyCode: string) {
  const db = admin();
  const { data: company } = await db.from("jsc_companies").select("id, name").eq("code", companyCode).maybeSingle();
  const { data: rows } = await db
    .from("platform_subscriptions")
    .select("id, status, billing_status, current_period_start, current_period_end, cancel_at_period_end, last_payment_failed_at, provider_subscription_id")
    .eq("company_id", company?.id ?? "")
    .eq("environment", ENV)
    .order("created_at", { ascending: false });
  return { company, rows };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    switch (body.action) {
      case "accounts":
        return json(await ensureAccounts(String(body.password ?? "")));
      case "clock_setup":
        return json(await clockSetup(String(body.company ?? "TESTB")));
      case "advance":
        return json(await advance(String(body.clockId), String(body.subscriptionId), Number(body.seconds ?? 2764800)));
      case "set_card":
        return json(await setCard(String(body.customerId), String(body.card ?? "pm_card_visa")));
      case "pay_open":
        return json(await payOpen(String(body.subscriptionId)));
      case "cancel":
        return json(await cancelAtPeriodEnd(String(body.subscriptionId)));
      case "concurrent":
        return json(await concurrent(String(body.company ?? "TESTA")));
      case "cleanup_reservations":
        return json(await cleanupReservations(String(body.company ?? "TESTA")));
      case "state":
        return json(await state(String(body.company ?? "TESTB")));
      default:
        return json({ error: "Action inconnue" }, 400);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erreur inattendue" }, 400);
  }
});
