import type { Metadata } from "next";
import { PageHero, SiteFrame } from "@/components/SiteFrame";

export const metadata: Metadata = {
  title: "Privacy · Omni Force Vector",
  description: "What the Omni Force Vector account stores, and what stays in WSSO, the Drone Directory and Workforce 2.0.",
};

export default function PrivacyPage() {
  return (
    <SiteFrame>
      <PageHero
        eyebrow="Privacy"
        title="What the central account holds"
        lede="This page describes the Omni Force Vector account. It is not the privacy policy of WSSO, the Drone Directory or Workforce 2.0."
      />
      <section className="section">
        <div className="wrap prose">
          <h2>Account data</h2>
          <p>Omni Force Vector stores the account you create: name, email, a password handled by the authentication provider, your Omni Force Vector ID, organization memberships, invitations, and the plans and entitlements attached to you or your organization.</p>
          <h2>Payments</h2>
          <p>Card payments go through Stripe. Omni Force Vector does not store your card number. Invoices and subscription status that Stripe reports are shown in the billing area of the hub.</p>
          <h2>Product data</h2>
          <p>WSSO workspaces, directory listings and Workforce 2.0 files are not stored in Omni Force Vector. Workforce documents stay on the computer where that app is installed. Signing in to OmniForce does not sign you in to WSSO. Opening the Directory through OmniForce uses a DirectoryUp login token only after an administrator has switched that path on.</p>
          <h2>Administration</h2>
          <p>Platform administrators can see account, organization, billing and audit records required to operate the hub. Linking an existing product account requires proof that the account is yours. A matching email by itself is not treated as that proof.</p>
          <h2>Each product</h2>
          <p>Use each product’s own site for how that product handles its data: wsso.tlbisbig.world, drones-drones-drones.directoryup.com and workforce.trackmystartup.com.</p>
        </div>
      </section>
    </SiteFrame>
  );
}
