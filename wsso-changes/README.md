# ⚠️ Draft only: do not apply

This folder is an early draft of WSSO-side changes, written before the current OmniForce design. Nothing here has been applied to WSSO, and it no longer matches OmniForce:

- It assumes WSSO tables `users`, `companies` and `roles`. WSSO uses `profiles` and `organizations`.
- It verifies a pushed "SSO ticket" (`aud=wsso`, `?ticket=` in the URL). OmniForce no longer issues those tickets. Module sign-in now uses the OIDC authorization-code flow with PKCE described in `docs/INTEGRATION_AUTH.md`.
- `omniforce-sso` links an existing WSSO user **by email**. The current design forbids that (see `docs/WSSO_INTEGRATION.md`, "How an existing WSSO user gets linked").

It's kept for reference only. WSSO work should start from `docs/INTEGRATION_AUTH.md` and `docs/WSSO_INTEGRATION.md`.
