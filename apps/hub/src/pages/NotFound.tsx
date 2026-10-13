import { Link } from "react-router-dom";
import { Wordmark } from "../components/ui";

export function NotFound() {
  return (
    <main className="redirect-screen" id="main">
      <Wordmark />
      <div className="stack" style={{ textAlign: "center", maxWidth: 420 }}>
        <h1>Page not found</h1>
        <p className="dim">That address is not part of the Omni Force Vector account.</p>
        <div className="row gap center-row">
          <Link className="btn btn-primary" to="/app">Go to the dashboard</Link>
          <Link className="btn btn-ghost" to="/login">Sign in</Link>
        </div>
      </div>
    </main>
  );
}
