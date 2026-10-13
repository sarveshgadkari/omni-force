import type { Metadata } from "next";
import { PageHero, SiteFrame } from "@/components/SiteFrame";
import { faqs } from "@/lib/site";

export const metadata: Metadata = {
  title: "FAQ · Omni Force Vector",
  description: "What Omni Force Vector is, how the three platforms fit, and what single sign-on and Workforce plans do not include.",
};

export default function FaqPage() {
  return (
    <SiteFrame>
      <PageHero eyebrow="FAQ" title="Questions about the central account" lede="Answers match the current catalogue and integration status." />
      <section className="section">
        <div className="wrap narrow">
          <div className="faq">
            {faqs.map((f) => (
              <details key={f.q}><summary>{f.q}</summary><p className="dim">{f.a}</p></details>
            ))}
          </div>
        </div>
      </section>
    </SiteFrame>
  );
}
