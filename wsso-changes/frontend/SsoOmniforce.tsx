// WSSO route: /sso/omniforce?ticket=…
// Add to the WSSO router:  <Route path="/sso/omniforce" element={<SsoOmniforce />} />
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase"; // ADAPT: your WSSO Supabase client

const HUB_URL = import.meta.env.VITE_OMNIFORCE_HUB_URL ?? "https://account.omniforce.app";

export default function SsoOmniforce() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ticket = new URLSearchParams(window.location.search).get("ticket");
    // remove the ticket from the address bar and history straight away
    window.history.replaceState(null, "", window.location.pathname);
    if (!ticket) { setError("Missing sign-in ticket."); return; }

    (async () => {
      await supabase.auth.signOut({ scope: "local" }); // never mix two people's sessions
      const { data, error } = await supabase.functions.invoke("omniforce-sso", { body: { ticket } });
      if (error || !data?.token_hash) {
        let msg = "We couldn't sign you in.";
        try { msg = (await (error as any)?.context?.json())?.error ?? msg; } catch { /* keep default */ }
        setError(msg);
        return;
      }
      const { error: vErr } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: data.token_hash });
      if (vErr) { setError("This sign-in link expired. Open WSSO from OmniForce again."); return; }
      window.location.replace(data.redirect_to ?? "/");
    })();
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeContent: "center", gap: 12, textAlign: "center", padding: 24 }}>
      {error ? (
        <>
          <h2>Sign-in didn't work</h2>
          <p>{error}</p>
          <a href={`${HUB_URL}/launch/wsso`}>Try again from OmniForce</a>
        </>
      ) : (
        <p>Signing you in with OmniForce…</p>
      )}
    </div>
  );
}
