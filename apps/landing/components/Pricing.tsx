import { HUB_URL, pricingNote, publicPlans } from "@/lib/site";
import { Arrow } from "./Icons";

export function Pricing({ compact = false }: { compact?: boolean }) {
  const rows = compact ? publicPlans.filter((p) => ["dir_scout", "dir_recreational", "wsso_starter_month", "wf_single_license", "bundle_dir_wsso_month"].includes(p.code)) : publicPlans;
  return (
    <div className="price-block">
      <div className="table-wrap">
        <table className="plans">
          <caption className="visually-hidden">Configured Omni Force Vector plans</caption>
          <thead>
            <tr>
              <th scope="col">Plan</th>
              <th scope="col">Modules</th>
              <th scope="col">Access</th>
              <th scope="col">Limits</th>
              {!compact && <th scope="col">Billing</th>}
              <th scope="col">Price</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.code}>
                <th scope="row">{p.name}</th>
                <td>{p.modules}</td>
                <td>{p.access}</td>
                <td>{p.limits}</td>
                {!compact && <td>{p.billing}</td>}
                <td>{p.price}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="dim price-note">{pricingNote}</p>
      <div className="hero-cta">
        <a className="btn btn-primary" href={`${HUB_URL}/signup`}>Create an account <Arrow /></a>
        {!compact && <a className="btn btn-ghost" href={`${HUB_URL}/login`}>Sign in to review plans</a>}
        {compact && <a className="btn btn-ghost" href="/pricing">Full catalogue</a>}
      </div>
    </div>
  );
}
