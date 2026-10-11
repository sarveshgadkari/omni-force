# WSSO sign-up and billing UI changes

1. **Sign-up**: replace the WSSO `/signup` page with a redirect to `https://account.omniforce.app/signup?plan=wsso:Growth`
   (keep the old page reachable only for existing invite links: `/signup?invite=…` must still work so admins can add employees).
2. **"Create a workspace" / "Plans" buttons** on the WSSO marketing page → link to the OmniForce landing `#pricing`.
3. **Billing page**: if `companies.billing_source = 'omniforce'`, hide the WSSO Stripe checkout and show
   "Billing is managed in your OmniForce account" with a link to `https://account.omniforce.app/app/billing`.
4. **Sign-in page**: add a primary "Continue with OmniForce" button → `https://account.omniforce.app/launch/wsso`.
   Keep email + password underneath for existing local users and invited employees.
5. **Header**: add `<OmniForceSwitcher />` for users whose `auth_source = 'omniforce'` or whose workspace is OmniForce-billed.
6. **Sign-out**: after `supabase.auth.signOut()`, send OmniForce users to `https://account.omniforce.app/login` instead of the WSSO login.
