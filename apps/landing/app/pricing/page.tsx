import type { Metadata } from "next";
import { Pricing } from "@/components/Pricing";
import { PageHero, SiteFrame } from "@/components/SiteFrame";

export const metadata: Metadata = {
  title: "Pricing · Omni Force Vector",
  description: "Configured Omni Force Vector plans, the modules they grant, and which prices are not yet published.",
};

export default function PricingPage() {
  return (
    <SiteFrame>
      <PageHero
        eyebrow="Pricing"
        title="The catalogue, without invented prices"
        lede="Plans below are the rows in the Omni Force Vector catalogue. A plan grants only the modules named on it. Paid Omni Force Vector prices are not published, and Workforce’s in-app plans are separate."
      />
      <section className="section">
        <div className="wrap">
          <Pricing />
        </div>
      </section>
    </SiteFrame>
  );
}
