// POST { return_url, organization_id? } → { url } (Stripe customer portal: cards, invoices, cancel, up/downgrade)
import { serve } from "../_shared/handler.ts";
import { json } from "../_shared/cors.ts";
import { admin, HttpError, requireUser } from "../_shared/db.ts";
import { stripe } from "../_shared/stripe.ts";
import { isHubUrl } from "../_shared/urls.ts";

serve(async (req) => {
  const user = await requireUser(req);
  const { return_url, organization_id } = await req.json();
  if (!isHubUrl(return_url)) throw new HttpError(400, "Invalid return address.");

  let customer: string | null = null;
  if (organization_id) {
    const { data: m } = await admin.from("organization_members").select("role, status, organization:organizations(stripe_customer_id)")
      .eq("organization_id", organization_id).eq("user_id", user.id).maybeSingle();
    if (!m || m.status !== "active" || !["owner", "billing"].includes(m.role)) throw new HttpError(403, "Only an owner or billing member can manage billing.");
    // deno-lint-ignore no-explicit-any
    customer = (m.organization as any)?.stripe_customer_id ?? null;
  } else {
    const { data: p } = await admin.from("profiles").select("stripe_customer_id").eq("id", user.id).single();
    customer = p?.stripe_customer_id ?? null;
  }
  if (!customer) throw new HttpError(400, "There's no paid plan to manage yet.");
  const s = await stripe.billingPortal.sessions.create({ customer, return_url });
  return json({ url: s.url });
});
