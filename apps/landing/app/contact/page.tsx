import type { Metadata } from "next";
import { PageHero, SiteFrame } from "@/components/SiteFrame";
import { HUB_URL, products } from "@/lib/site";
import { External } from "@/components/Icons";

export const metadata: Metadata = {
  title: "Contact · Omni Force Vector",
  description: "Where to go for an Omni Force Vector account question, and where each product handles its own support.",
};

export default function ContactPage() {
  return (
    <SiteFrame>
      <PageHero
        eyebrow="Contact"
        title="Account questions stay here. Product questions stay with the product."
        lede="Omni Force Vector does not run WSSO, the Drone Directory or Workforce 2.0. Use the hub for the central account, and the product’s own site for anything inside that application."
      />
      <section className="section">
        <div className="wrap">
          <div className="cards">
            <article className="card">
              <h3>Omni Force Vector account</h3>
              <p className="dim">Registration, email verification, organizations, invitations, plans and billing are handled in the account hub.</p>
              <p><a href={`${HUB_URL}/login`}>Sign in</a> · <a href={`${HUB_URL}/signup`}>Create account</a></p>
            </article>
            {products.map((p) => (
              <article key={p.key} className="card">
                <h3>{p.name}</h3>
                <p className="dim">{p.position}</p>
                <p><a href={p.site} target="_blank" rel="noopener noreferrer">{p.siteLabel} <External /></a></p>
              </article>
            ))}
          </div>
          <p className="dim lede-sm" style={{ marginTop: 28 }}>
            WSSO company inquiries are published by TLBISBIG at tlbisbig.world. There is no separate Omni Force Vector support inbox on this site.
          </p>
        </div>
      </section>
    </SiteFrame>
  );
}
