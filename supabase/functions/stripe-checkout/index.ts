// POST { plan_ids: string[], success_url, cancel_url, organization_id? } → { url }
// With organization_id the organization is billed and owns the subscription;
// only its owner or billing members may do that.
import { serve } from "../_shared/handler.ts";
import { json } from "../_shared/cors.ts";
import { admin, HttpError, requireUser } from "../_shared/db.ts";
import { stripe } from "../_shared/stripe.ts";
import { isHubUrl } from "../_shared/urls.ts";

serve(async (req) => {
  const user = await requireUser(req);
  const { plan_ids, success_url, cancel_url, organization_id } = await req.json();
  if (!Array.isArray(plan_ids) || plan_ids.length === 0 || plan_ids.length > 10) throw new HttpError(400, "Choose at least one plan.");
  if (!isHubUrl(success_url) || !isHubUrl(cancel_url)) throw new HttpError(400, "Invalid return address.");

  const { data: plans } = await admin.from("plans").select("*").in("id", plan_ids).eq("is_active", true);
  if (!plans?.length || plans.length !== plan_ids.length) throw new HttpError(400, "One of those plans is no longer available.");
  const intervals = new Set(plans.map((p) => p.interval));
  if (intervals.size > 1) throw new HttpError(400, "Pick all monthly or all yearly plans in one checkout.");
  const missing = plans.find((p) => !p.stripe_price_id);
  if (missing) throw new HttpError(400, `${missing.name} isn't set up for payment yet.`);
  const ownerKind = organization_id ? "organization" : "individual";
  const wrong = plans.find((p) => p.audience !== "any" && p.audience !== ownerKind);
  if (wrong) throw new HttpError(400, `${wrong.name} is only available for ${wrong.audience === "organization" ? "organizations" : "individual accounts"}.`);

  const { data: profile } = await admin.from("profiles").select("*").eq("id", user.id).single();
  if (!profile || profile.status !== "active") throw new HttpError(403, "This account is disabled.");

  let customer: string | null;
  const meta: Record<string, string> = { supabase_user_id: user.id, omniforce_user_id: profile.omniforce_id };
  if (organization_id) {
    const { data: m } = await admin.from("organization_members").select("role, status, organization:organizations(id, name, status, stripe_customer_id)")
      .eq("organization_id", organization_id).eq("user_id", user.id).maybeSingle();
    // deno-lint-ignore no-explicit-any
    const org = m?.organization as any;
    if (!m || m.status !== "active" || !org || org.status !== "active" || !["owner", "billing"].includes(m.role)) {
      throw new HttpError(403, "Only an owner or billing member can buy for this organization.");
    }
    meta.organization_id = org.id;
    customer = org.stripe_customer_id;
    if (!customer) {
      const c = await stripe.customers.create({ email: profile.email, name: org.name, metadata: { organization_id: org.id, created_by: profile.omniforce_id } });
      customer = c.id;
      await admin.from("organizations").update({ stripe_customer_id: customer }).eq("id", org.id);
    }
  } else {
    customer = profile.stripe_customer_id;
    if (!customer) {
      const c = await stripe.customers.create({
        email: profile.email,
        name: `${profile.first_name} ${profile.last_name}`.trim(),
        metadata: { omniforce_user_id: profile.omniforce_id, supabase_user_id: user.id },
      });
      customer = c.id;
      await admin.from("profiles").update({ stripe_customer_id: customer }).eq("id", user.id);
    }
  }

  const trial = Math.max(...plans.map((p) => p.trial_days ?? 0));
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customer!,
    client_reference_id: organization_id ?? user.id,
    line_items: plans.map((p) => ({ price: p.stripe_price_id!, quantity: 1 })),
    subscription_data: { metadata: meta, ...(trial > 0 ? { trial_period_days: trial } : {}) },
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    automatic_tax: { enabled: Deno.env.get("STRIPE_AUTOMATIC_TAX") === "1" },
    success_url: `${success_url}${success_url.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
    cancel_url,
  });
  return json({ url: session.url });
});
