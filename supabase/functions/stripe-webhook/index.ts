// Stripe → OmniForce. Configure in Stripe for: checkout.session.completed,
// customer.subscription.created|updated|deleted, invoice.paid, invoice.payment_failed.
// Deploy with --no-verify-jwt (Stripe can't send a Supabase JWT).
import { admin, audit } from "../_shared/db.ts";
import { cryptoProvider, stripe } from "../_shared/stripe.ts";
import type Stripe from "npm:stripe@17.4.0";

const SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

/**
 * Who owns this Stripe customer: an organization (its own customer) or an individual.
 * The customer record is authoritative; metadata only fills in the buyer.
 */
async function ownerFor(customer: string, meta?: Stripe.Metadata | null): Promise<{ userId?: string; orgId?: string }> {
  const { data: org } = await admin.from("organizations").select("id, created_by").eq("stripe_customer_id", customer).maybeSingle();
  if (org) {
    let buyer = meta?.supabase_user_id as string | undefined;
    if (!buyer) {
      const { data: o } = await admin.from("organization_members").select("user_id").eq("organization_id", org.id).eq("role", "owner").order("created_at").limit(1).maybeSingle();
      buyer = o?.user_id ?? org.created_by ?? undefined;
    }
    return { userId: buyer, orgId: org.id };
  }
  const { data } = await admin.from("profiles").select("id").eq("stripe_customer_id", customer).maybeSingle();
  return { userId: (data?.id as string | undefined) ?? (meta?.organization_id ? undefined : meta?.supabase_user_id) };
}

async function syncSubscription(sub: Stripe.Subscription) {
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const { userId, orgId } = await ownerFor(customer, sub.metadata);
  if (!userId) throw new Error(`No OmniForce owner for customer ${customer}`);

  // deno-lint-ignore no-explicit-any
  const periodEnd = (sub as any).current_period_end ?? (sub.items.data[0] as any)?.current_period_end;
  const { data: row, error } = await admin.from("subscriptions").upsert({
    user_id: userId,
    organization_id: orgId ?? null,
    stripe_subscription_id: sub.id,
    stripe_customer_id: customer,
    status: sub.status,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end,
  }, { onConflict: "stripe_subscription_id" }).select().single();
  if (error) throw error;

  // replace items
  await admin.from("subscription_items").delete().eq("subscription_id", row.id);
  const priceIds = sub.items.data.map((i) => i.price.id);
  const { data: plans } = await admin.from("plans").select("id, stripe_price_id").in("stripe_price_id", priceIds);
  const items = sub.items.data
    .map((i) => ({ subscription_id: row.id, plan_id: plans?.find((p) => p.stripe_price_id === i.price.id)?.id, stripe_item_id: i.id, quantity: i.quantity ?? 1 }))
    .filter((i) => i.plan_id);
  if (items.length) await admin.from("subscription_items").insert(items);

  // entitlements → triggers queue provisioning to Directory / WSSO
  const { error: rpcErr } = orgId
    ? await admin.rpc("recompute_org_entitlements", { p_org: orgId })
    : await admin.rpc("recompute_entitlements", { p_user: userId });
  if (rpcErr) throw rpcErr;
  await audit(null, `stripe.subscription.${sub.status}`, "subscription", sub.id, { user_id: userId, organization_id: orgId ?? null });
}

Deno.serve(async (req) => {
  const sig = req.headers.get("Stripe-Signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig!, SECRET, undefined, cryptoProvider);
  } catch {
    return new Response("bad signature", { status: 400 });
  }

  // idempotency: skip events we already processed
  const { data: seen } = await admin.from("stripe_events").select("processed_at").eq("id", event.id).maybeSingle();
  if (seen?.processed_at) return new Response("ok");
  await admin.from("stripe_events").upsert({ id: event.id, type: event.type, payload: event as unknown as Record<string, unknown> });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.subscription) await syncSubscription(await stripe.subscriptions.retrieve(String(s.subscription)));
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      case "invoice.paid":
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        const { userId, orgId } = await ownerFor(String(inv.customer));
        if (userId || orgId) {
          await admin.from("invoices").upsert({
            id: inv.id, user_id: orgId ? null : userId, organization_id: orgId ?? null, number: inv.number, amount_paid_cents: inv.amount_paid, currency: inv.currency,
            status: inv.status ?? "open", hosted_invoice_url: inv.hosted_invoice_url, pdf_url: inv.invoice_pdf,
            created_at: new Date(inv.created * 1000).toISOString(),
          });
        }
        break;
      }
    }
    await admin.from("stripe_events").update({ processed_at: new Date().toISOString(), error: null }).eq("id", event.id);
    return new Response("ok");
  } catch (e) {
    await admin.from("stripe_events").update({ error: String(e) }).eq("id", event.id);
    console.error(e);
    return new Response("retry", { status: 500 }); // Stripe retries
  }
});
