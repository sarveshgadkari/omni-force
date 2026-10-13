// Public-site content. Product facts follow each product's own website
// (checked 2026-10-13 against the live sites) and docs/ARCHITECTURE.md. Plan rows follow
// supabase/seed.sql. Dollar amounts in that seed are not published here:
// Directory paid plans and the bundle are marked placeholders, Stripe price
// IDs are unset, and WSSO's own website prices are not Omni Force Vector prices.

export const HUB_URL =
  process.env.NEXT_PUBLIC_HUB_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:5173" : "");

export type ModuleKey = "directory" | "wsso" | "workforce";

export const headline = "Three Platforms. One Subscription. One Place to Work.";
export const supporting =
  "Manage business operations, discover the drone industry and put AI to work — through one central platform.";

export type Product = {
  key: ModuleKey;
  name: string;
  site: string;
  siteLabel: string;
  eyebrow: string;
  position: string;
  summary: string;
  value: string;
  features: { title: string; body: string }[];
  uses: string[];
  workflow: { title: string; body: string }[];
  faqs: { q: string; a: string }[];
  access: string;
  operator: string;
  cta: string;
};

export const products: Product[] = [
  {
    key: "wsso",
    name: "WSSO",
    site: "https://wsso.tlbisbig.world",
    siteLabel: "wsso.tlbisbig.world",
    eyebrow: "Business operations",
    position: "Business operations: teams, projects, tasks, attendance, leave, CRM, clients, documents, training and reports.",
    summary:
      "WSSO is the daily operations platform for time and attendance, work orders, people, clients, leads, training and reports. It is built around one company workspace, with organization-level membership and administration.",
    value:
      "A company keeps attendance, assigned work, CRM and training in the same workspace. Roles run from admin to director, manager and employee, and that company's data stays in its own workspace.",
    features: [
      { title: "Time and attendance", body: "Clock in and out in each person's timezone. Shifts do not run past local midnight or 24 hours." },
      { title: "Shifts, timezones and leave", body: "Country-aware timezones, a local midnight close, and leave requests in the same system." },
      { title: "Work orders and TACTICs", body: "Assign work, track status on a kanban, and keep the document trail with the job." },
      { title: "People and CRM", body: "Employees, clients and leads, with roles for admin, director, manager and employee." },
      { title: "Organization and isolation", body: "Membership and administration sit at the company workspace. Each workspace's data stays separate." },
      { title: "Training and documents", body: "Training modules, knowledge checks and shared documents the team uses on the job." },
      { title: "Reports", body: "Time, project-progress and performance reports for the company." },
      { title: "Optional MCP", body: "An optional, workspace-scoped connection so AI tools use WSSO with the same permissions as a signed-in user." },
    ],
    uses: [
      "A company admin running attendance, leave and shifts for the whole workspace.",
      "Managers assigning work orders and tracking them on a kanban.",
      "Teams keeping clients, leads and employees in one company record.",
      "Owners reading time, project-progress and performance reports.",
    ],
    workflow: [
      { title: "Open the company workspace", body: "People work inside the company workspace. Roles decide what each person can administer." },
      { title: "Record time and assign work", body: "Clock in, request leave, and move work orders and TACTICs across the kanban." },
      { title: "Train and report", body: "Run training modules and knowledge checks, share documents, and read the owner reports." },
    ],
    faqs: [
      { q: "Does Omni Force Vector sign you into WSSO?", a: "No. WSSO single sign-on is not configured. Use the login on wsso.tlbisbig.world. An Omni Force Vector subscription does not create a WSSO workspace while provisioning is disabled." },
      { q: "Are WSSO's published prices the Omni Force Vector price?", a: "No. WSSO sells its own Starter, Growth, Business and Enterprise plans on its website. Those figures are not Omni Force Vector prices." },
    ],
    access:
      "Omni Force Vector can record a WSSO entitlement for an individual or an organization, including a seat limit when the plan has one. Opening WSSO still uses WSSO's own login. Sign-in through Omni Force Vector is not configured, and subscribing does not provision a WSSO account.",
    operator: "WSSO is a product of TLBISBIG Consulting Group, LLC, under SME Digital Business Solutions.",
    cta: "Open WSSO",
  },
  {
    key: "directory",
    name: "Drone Directory",
    site: "https://drones-drones-drones.directoryup.com",
    siteLabel: "drones-drones-drones.directoryup.com",
    eyebrow: "Drone industry discovery",
    position: "A directory for discovering businesses, service providers and profiles across the drone ecosystem.",
    summary:
      "The Drone Directory is a DirectoryUp site for finding drone training, pilots and sourcing. Search by keyword and location, compare member profiles and reviews, and contact members. Businesses can list themselves in the directory.",
    value:
      "People looking for a drone professional can compare trainers, pilots, service providers and vendors in one search. Businesses that want to be discovered can publish a listing with a category, profile and reviews.",
    features: [
      { title: "Search", body: "Search by the kind of member you need and your location, then browse who is listed." },
      { title: "Who you can find", body: "Drone trainers, pilots, service providers and vendors, including recreational and commercial pilot listings." },
      { title: "Profiles, categories and reviews", body: "Browse member profiles, categories and customer reviews before you contact anyone." },
      { title: "Contact", body: "Message members through the directory." },
      { title: "Events", body: "Webinars, seminars, networking, trade shows and related industry events." },
      { title: "Jobs, coupons, classifieds and media", body: "Browse jobs, coupons, classifieds and media galleries." },
      { title: "List a business", body: "Add a business so people searching the directory can find it." },
    ],
    uses: [
      "An operator looking for a local pilot, trainer or service provider.",
      "A buyer comparing profiles, categories and reviews before sending a message.",
      "A training company, vendor or contractor that wants a public listing.",
    ],
    workflow: [
      { title: "Search", body: "Enter a keyword and a location." },
      { title: "Compare", body: "Open profiles, categories and reviews." },
      { title: "Contact or list", body: "Message a member, or list your own business in the directory." },
    ],
    faqs: [
      { q: "Does Omni Force Vector run the directory software?", a: "No. The directory runs on DirectoryUp. Omni Force Vector does not control those features." },
      { q: "Can I sign in to the directory with Omni Force Vector?", a: "Not today. Directory single sign-on is not configured. Use the directory's own login. Subscribing does not create a directory account while provisioning is disabled." },
    ],
    access:
      "Omni Force Vector can hold a directory entitlement. That does not operate DirectoryUp, and it does not sign you in. Scout and Recreational Pilot are configured as free plans. Paid directory prices in the database are placeholders and are not offered on this site.",
    operator: "Operated as a DirectoryUp site. Omni Force Vector does not control the underlying directory features.",
    cta: "Open the Drone Directory",
  },
  {
    key: "workforce",
    name: "Workforce 2.0",
    site: "https://workforce.trackmystartup.com",
    siteLabel: "workforce.trackmystartup.com",
    eyebrow: "AI-powered work automation",
    position: "AI work through voice or text: research, marketing, inbox and workflow tasks. Free to download. Paid options inside the app are billed separately.",
    summary:
      "Workforce 2.0 is a desktop and Android app. You make a request by voice or text. A planner coordinates specialist AI workers. You review and approve sensitive outbound actions before they proceed, by default.",
    value:
      "It takes a plain-language job — prospecting, a content calendar, an inbox draft, a price check — and prepares the output with the apps you connect. Sending, publishing and spending wait for you.",
    features: [
      { title: "Voice or text", body: "Describe the task in ordinary words, spoken or typed. Chat and voice are included and do not use the task allowance." },
      { title: "Planner and specialists", body: "A planner coordinates specialist AI workers. You describe the job; Workforce works out what happens next." },
      { title: "Sales", body: "Find prospects, check their details, and prepare outreach for your review." },
      { title: "Marketing", body: "Turn brand and competitor research into a plan, a calendar and content." },
      { title: "Inbox", body: "Catch the requests that matter and draft replies in your voice." },
      { title: "Competitor prices", body: "Compare published prices and spot changes." },
      { title: "Connected apps", body: "Works with Google Workspace, Microsoft 365, Slack, WhatsApp and GitHub." },
      { title: "Files and approval", body: "Files are stored and indexed on your computer. Team sharing uses Google Drive. AI needs internet. Sending, publishing and spending need approval by default. No response within 90 seconds stops the action. Approval can be turned off for an individual step." },
    ],
    uses: [
      "Preparing a prospect list and outreach without sending it until you approve.",
      "Turning research into a marketing calendar and draft content.",
      "Drafting inbox replies and checking published competitor prices.",
    ],
    workflow: [
      { title: "Describe the task", body: "Say it or type it. Ordinary words are enough." },
      { title: "Workforce plans the work", body: "A planner coordinates the specialist workers and the connected apps the job needs." },
      { title: "Specialists prepare the output", body: "Workers research, draft and assemble the result." },
      { title: "You approve sensitive actions", body: "By default, sending, publishing and spending wait for your review. No response within 90 seconds stops the action." },
    ],
    faqs: [
      { q: "Is the Workforce free plan part of Omni Force Vector?", a: "The published Workforce free plan is 300 tasks a month. Chat and voice are included. The free plan does not include CRM or persistent memory. Images and video use separate media credits. That plan is Workforce's own offer. It is not granted by an Omni Force Vector subscription unless a plan in the Omni Force Vector catalogue says so. None does today." },
      { q: "Which computers can run it?", a: "Windows, Linux (Intel/AMD) and Android. Mac and iPhone downloads are not currently available on the published site." },
      { q: "Are paid Workforce plans included?", a: "No. Paid plans and extra features may be purchased inside Workforce 2.0. Omni Force Vector licence rows (Single site, Multi site) have no public price and do not include those in-app plans or media credits." },
    ],
    access:
      "Omni Force Vector licence activation from the app is not live. Download and use Workforce from its own site. An Omni Force Vector subscription does not turn on Workforce paid plans or media credits.",
    operator: "Published by Workforce at workforce.trackmystartup.com. Files stay on your computer. AI features need internet.",
    cta: "Open Workforce 2.0",
  },
];

export const productByKey = Object.fromEntries(products.map((p) => [p.key, p])) as Record<ModuleKey, Product>;

export const howItWorks = [
  {
    n: "01",
    title: "Create an Omni Force Vector account",
    body: "Register with your name, email and password. Confirm the email with the 6-digit code we send. After that, sign in with the same email and password. This login is the Omni Force Vector account. It is not a login for WSSO or the Drone Directory.",
  },
  {
    n: "02",
    title: "Create or join an organization if you need one",
    body: "An organization is optional for an individual entitlement and required when a company shares access. Create one from the hub, or accept an invitation. Invitations are single-use and only work for the invited, verified email address. Roles are owner, admin, billing and member. Owners and billing manage payment. Admins manage people, invitations and module seats. Members use the modules they have a seat for.",
  },
  {
    n: "03",
    title: "Choose an Omni Force Vector subscription",
    body: "Plans in the hub come from the central catalogue. Each plan grants specific modules, for an individual or an organization, with the seat limit configured on that plan. Free directory plans (Scout and Recreational Pilot) are $0. Paid directory prices and the Directory + WSSO bundle price are placeholders and are not offered here. WSSO seat tiers are in the catalogue, but WSSO's website prices are not Omni Force Vector prices, and Stripe price IDs are not set. Workforce rows are licences with no public price. Renewal and cancellation, once a Stripe subscription exists, are handled in the billing portal: a subscription renews until you cancel, and cancel-at-period-end ends access at the period end.",
  },
  {
    n: "04",
    title: "Open an enabled platform",
    body: "The module launcher shows Drone Directory, WSSO and Workforce 2.0. What you can open depends on a live entitlement — yours, or an organization seat — and on that application's integration. WSSO and the Drone Directory are not configured for single sign-on. Workforce licence activation from the app is not live. Subscribing does not create accounts in those applications while provisioning is disabled.",
  },
  {
    n: "05",
    title: "Manage access centrally",
    body: "From the hub you can see your account, organizations, members, invitations, subscriptions and which modules each entitlement covers. Changing a module still uses that product's own login until its integration is switched on.",
  },
];

export const benefits = [
  { title: "One account", body: "Registration, email verification and sign-in live in Omni Force Vector, separate from each product's login." },
  { title: "Organizations", body: "Invite people, assign roles, and give module seats from the organization — when a plan includes seats." },
  { title: "Subscriptions you can inspect", body: "The hub lists the plans that are actually configured, including which modules and seat limits they grant." },
  { title: "A module launcher", body: "Enabled products are listed in one place. Access still depends on the entitlement and that product's integration status." },
];

export type PublicPlan = {
  code: string;
  name: string;
  modules: string;
  access: string;
  limits: string;
  billing: string;
  price: string;
};

/** Monthly, free and licence rows from supabase/seed.sql. Yearly rows exist as 10× the monthly amount and are not listed with a price. */
export const publicPlans: PublicPlan[] = [
  { code: "dir_scout", name: "Scout", modules: "Drone Directory", access: "Individual or organization", limits: "No seat cap configured", billing: "Free", price: "Free" },
  { code: "dir_recreational", name: "Recreational Pilot", modules: "Drone Directory", access: "Individual or organization", limits: "No seat cap configured", billing: "Free", price: "Free" },
  { code: "dir_commercial_month", name: "Commercial Pilot", modules: "Drone Directory", access: "Individual or organization", limits: "No seat cap configured", billing: "Monthly and yearly rows exist", price: "Not published" },
  { code: "dir_provider_month", name: "Service Provider", modules: "Drone Directory", access: "Individual or organization", limits: "No seat cap configured", billing: "Monthly and yearly rows exist", price: "Not published" },
  { code: "dir_vendor_month", name: "Vendor", modules: "Drone Directory", access: "Individual or organization", limits: "No seat cap configured", billing: "Monthly and yearly rows exist", price: "Not published" },
  { code: "dir_employer_month", name: "Employer / Contractor", modules: "Drone Directory", access: "Individual or organization", limits: "No seat cap configured", billing: "Monthly and yearly rows exist", price: "Not published" },
  { code: "wsso_starter_month", name: "Starter", modules: "WSSO", access: "Individual or organization", limits: "10 seats · 14-day trial", billing: "Monthly and yearly rows exist", price: "Not an Omni Force Vector price" },
  { code: "wsso_growth_month", name: "Growth", modules: "WSSO", access: "Individual or organization", limits: "50 seats · 14-day trial", billing: "Monthly and yearly rows exist", price: "Not an Omni Force Vector price" },
  { code: "wsso_business_month", name: "Business", modules: "WSSO", access: "Individual or organization", limits: "150 seats", billing: "Monthly and yearly rows exist", price: "Not an Omni Force Vector price" },
  { code: "wsso_enterprise_month", name: "Enterprise", modules: "WSSO", access: "Individual or organization", limits: "500 seats", billing: "Monthly and yearly rows exist", price: "Not an Omni Force Vector price" },
  { code: "wf_single_license", name: "Single site", modules: "Workforce 2.0", access: "Individual or organization", limits: "Licence · no seat cap configured", billing: "Licence, not a task plan", price: "No public price" },
  { code: "wf_multi_license", name: "Multi site", modules: "Workforce 2.0", access: "Individual or organization", limits: "Licence · no seat cap configured", billing: "Licence, not a task plan", price: "No public price" },
  { code: "bundle_dir_wsso_month", name: "Directory + WSSO", modules: "Drone Directory and WSSO", access: "Individual or organization", limits: "50 seats · 14-day trial", billing: "Monthly and yearly rows exist", price: "Not published" },
];

export const pricingNote =
  "Only Scout and Recreational Pilot have a configured price: free. Other amounts stored in the catalogue are either placeholders (paid directory plans and the Directory + WSSO bundle) or WSSO's own plan figures, which are not Omni Force Vector prices. Stripe price IDs are not set, so this site does not offer those paid amounts. Workforce's 300-task free plan, paid Workforce plans and media credits are purchased inside Workforce 2.0 unless a future Omni Force Vector plan explicitly includes them.";

export const faqs = [
  { q: "What is Omni Force Vector?", a: "Omni Force Vector is the central account for the Drone Directory, WSSO and Workforce 2.0. It handles registration, organizations, subscriptions and a hub that shows which modules an account can open. It does not replace each product's own application." },
  { q: "What are the three platforms?", a: "WSSO is the company workspace for time, work orders, people, training and reports. The Drone Directory is where you search for drone professionals or list a business. Workforce 2.0 is the AI work app: you describe a task, specialists prepare it, and you approve sensitive actions." },
  { q: "How does the combined subscription work?", a: "The catalogue can grant one module or a bundle. The only bundle configured today is Directory + WSSO, and its price is a placeholder, so it is not offered on this site. A subscription grants the modules on that plan. It does not automatically include every Workforce paid feature, and it does not create accounts in WSSO or the directory while provisioning is disabled." },
  { q: "Is Workforce 2.0 free to download?", a: "Workforce publishes a free plan with 300 tasks a month. Chat and voice are included. The free plan does not include CRM or persistent memory. Images and video use separate media credits. Windows, Linux (Intel/AMD) and Android are supported. Mac and iPhone downloads are not currently available. Download it from workforce.trackmystartup.com." },
  { q: "Are Workforce 2.0 paid features included?", a: "No. Paid plans and additional features may be purchased inside Workforce 2.0. Omni Force Vector does not grant those task plans or media credits." },
  { q: "Can a company manage access for its team?", a: "Yes. Create an organization, subscribe to a plan that includes the modules you need, and assign seats where the plan has a seat limit. Owners and billing manage payment. Admins manage members and seats." },
  { q: "How do organization invitations work?", a: "An admin or owner invites an email address. The link is single-use and only works for that verified email. The invited person accepts it in the Omni Force Vector hub and receives the role on the invitation." },
  { q: "Can users switch modules?", a: "The launcher lists the modules their entitlement covers. Switching does not sign them into WSSO or the Drone Directory. Those products keep their own logins until single sign-on is configured and verified." },
  { q: "Is single sign-on available for every platform?", a: "No. Omni Force Vector sign-in is only the central account. WSSO and the Drone Directory are not configured for single sign-on. Workforce licence activation from the app is not live. Nothing here claims those integrations work." },
  { q: "How are subscription and access issues handled?", a: "Billing, invoices and cancellation are in the hub's billing area, through Stripe once a subscription exists. Module access follows the live entitlement and seat assignment. If a product will not open, check that the entitlement is active and remember that external sign-in is still that product's own login. Platform administrators can review account links, integration queues and audit logs." },
];

export const navLinks = [
  { href: "/#products", label: "Products" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
];

export const legalLinks = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];
