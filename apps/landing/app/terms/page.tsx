import type { Metadata } from "next";
import { PageHero, SiteFrame } from "@/components/SiteFrame";

export const metadata: Metadata = {
  title: "Terms · Omni Force Vector",
  description: "What an Omni Force Vector subscription covers, and what it does not include.",
};

export default function TermsPage() {
  return (
    <SiteFrame>
      <PageHero
        eyebrow="Terms"
        title="What this subscription is"
        lede="An Omni Force Vector subscription is access to the modules named on the plan you choose. It is not a login for every product, and it is not a promise of unpublished prices."
      />
      <section className="section">
        <div className="wrap prose">
          <h2>The account</h2>
          <p>You register with a name, email and password, and you confirm the email. The account is yours to keep accurate. Organizations need at least one owner. Invitations work once, and only for the invited email address.</p>
          <h2>Plans</h2>
          <p>A plan grants the modules listed on it, for an individual or an organization, with any seat limit configured on that plan. Scout and Recreational Pilot are free. Other catalogue amounts are not offered as Omni Force Vector prices on this site until they are published and a Stripe price is configured. Paying does not, by itself, create a WSSO workspace or a directory account.</p>
          <h2>Workforce 2.0</h2>
          <p>Workforce 2.0 is free to download from its own site. Its free task allowance, paid plans and media credits are billed inside Workforce unless an Omni Force Vector plan explicitly includes them. None does today. Licence activation from the desktop app is not live.</p>
          <h2>Sign-in</h2>
          <p>Omni Force Vector sign-in is the central account. Directory sign-in through OmniForce uses a DirectoryUp login token once an administrator switches it on. WSSO single sign-on is not configured.</p>
          <h2>Billing</h2>
          <p>When a Stripe subscription exists, it renews until you cancel. Cancellation takes effect as the billing portal and the subscription record describe it. A failed payment does not count as a successful purchase.</p>
          <h2>The products</h2>
          <p>WSSO, the Drone Directory and Workforce 2.0 are separate applications with their own operators and their own terms. Omni Force Vector does not control features inside those applications.</p>
        </div>
      </section>
    </SiteFrame>
  );
}
