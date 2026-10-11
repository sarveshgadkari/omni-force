// Small illustrative UI vignettes for each product section (sample content).
import type { ModuleKey } from "@/lib/site";

export function ProductVisual({ m }: { m: ModuleKey }) {
  if (m === "directory") {
    return (
      <div className="vis" aria-hidden="true">
        <div className="vis-search"><span className="vis-field">Commercial Pilot</span><span className="vis-field">Denver, CO</span><span className="vis-btn">Search</span></div>
        {[["Front Range Aerial", "Commercial Pilot · 12 mi", 5], ["Peak Survey Co.", "Service Provider · 18 mi", 4], ["SkyTrain Academy", "Trainer · 25 mi", 5]].map(([n, d, s]) => (
          <div key={n as string} className="vis-card">
            <span className="vis-avatar" />
            <span className="vis-main"><strong>{n}</strong><span>{d}</span></span>
            <span className="vis-stars">{"★".repeat(s as number)}<em>{"★".repeat(5 - (s as number))}</em></span>
            <span className="vis-tag">Verified</span>
          </div>
        ))}
        <ol className="vis-steps"><li>Search your area</li><li>Read reviews</li><li>Send a message</li></ol>
      </div>
    );
  }
  if (m === "wsso") {
    const cols: [string, string[]][] = [["To do", ["Roof inspection · WO-118", "Client onboarding"]], ["In progress", ["Site survey · WO-114", "Safety training"]], ["Done", ["Timesheets approved"]]];
    return (
      <div className="vis" aria-hidden="true">
        <div className="vis-bar"><span>Work orders</span><span className="vis-clock">Clocked in · 08:02</span></div>
        <div className="vis-kanban">
          {cols.map(([c, items]) => (
            <div key={c} className="vis-col"><span className="vis-col-h">{c}<em>{items.length}</em></span>{items.map((i) => <span key={i} className="vis-task">{i}</span>)}</div>
          ))}
        </div>
        <div className="vis-kpis"><span><strong>42</strong>people</span><span><strong>188</strong>hours this week</span><span><strong>96%</strong>on time</span></div>
      </div>
    );
  }
  return (
    <div className="vis" aria-hidden="true">
      <div className="vis-chat vis-me">Draft replies to this week's new leads and book follow-ups.</div>
      <div className="vis-chat vis-ai"><strong>Sales worker</strong>12 replies drafted from your past emails. 3 meetings proposed for Thursday.</div>
      <div className="vis-approve">
        <span>Waiting for your approval before anything is sent</span>
        <span className="vis-actions"><span className="vis-btn">Approve</span><span className="vis-btn vis-ghost">Review</span></span>
      </div>
      <div className="vis-engines">{["Sales", "Marketing", "Inbox", "Competitor prices", "Video studio", "Job applications"].map((e) => <span key={e}>{e}</span>)}</div>
    </div>
  );
}
