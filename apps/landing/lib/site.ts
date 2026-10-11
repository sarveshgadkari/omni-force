// Central place for landing-page content. Product descriptions follow each
// product's own website (checked 2026-10-11):
//   Drone Directory  https://drones-drones-drones.directoryup.com
//   WSSO             https://wsso.tlbisbig.world
//   Workforce 2.0    https://workforce.trackmystartup.com
// Prices marked `placeholder: true` are not final; replace them before launch.

export const HUB_URL = process.env.NEXT_PUBLIC_HUB_URL ?? "http://localhost:5173";

export type ModuleKey = "directory" | "wsso" | "workforce";

export type Product = {
  key: ModuleKey;
  name: string;
  site: string;
  siteLabel: string;
  eyebrow: string;
  headline: string;
  subhead?: string;
  summary: string;
  chips: { label: string; title: string }[];
  features: { title: string; body: string }[];
  operator: string;
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
  /** What OmniForce does for this product today. Never claim SSO is live. */
  omniforce: string;
};

export const products: Product[] = [
  {
    key: "directory",
    name: "Drone Directory",
    site: "https://drones-drones-drones.directoryup.com",
    siteLabel: "drones-drones-drones.directoryup.com",
    eyebrow: "Drone Directory",
    headline: "Find top drone trainers, pilots and service providers.",
    summary:
      "A searchable directory for the drone industry. Search by need and location, read reviews from customers, and message members directly. Professionals list their business and get found.",
    chips: [
      { label: "Recreational Pilot", title: "Listing category" },
      { label: "Commercial Pilot", title: "Listing category" },
      { label: "Service Provider", title: "Listing category" },
      { label: "Vendor", title: "Listing category" },
    ],
    features: [
      { title: "Search members in your area", body: "Find pilots, trainers and providers by what you need and where." },
      { title: "Read reviews from customers", body: "Member profiles with ratings and verified badges." },
      { title: "Message members", body: "Contact professionals straight from their listing." },
      { title: "Events", body: "Webinars, seminars and trainings, networking, trade shows, fly-ins and demonstrations." },
      { title: "Jobs board", body: "Full-time and part-time drone work." },
      { title: "Classifieds and deals", body: "Classified listings, new products for sale, coupons and deals." },
    ],
    operator: "Operated by HG Consulting Services, LLC in partnership with My Drone Force and TLB Enterprises.",
    primary: { label: "Search the Directory", href: "https://drones-drones-drones.directoryup.com" },
    secondary: { label: "List your business", href: "https://drones-drones-drones.directoryup.com" },
    omniforce: "Free Scout plan with every OmniForce account. Directory sign-in through OmniForce is not configured yet; use your Directory login.",
  },
  {
    key: "wsso",
    name: "WSSO",
    site: "https://wsso.tlbisbig.world",
    siteLabel: "wsso.tlbisbig.world",
    eyebrow: "WSSO · Work management system",
    headline: "Run the company. In one workspace.",
    summary:
      "Time, people, work orders, CRM and training in one company workspace. The company admin subscribes once and pays for every seat; each company's data stays isolated.",
    chips: [
      { label: "Small teams", title: "Who it's for" },
      { label: "Typical SMB", title: "Who it's for" },
      { label: "Larger organizations", title: "Who it's for" },
    ],
    features: [
      { title: "Time and attendance", body: "Clock in and out in each person's local timezone, with leave requests and shift limits." },
      { title: "Work orders and TACTICs", body: "Assign work, track status on a kanban board and keep a document trail." },
      { title: "People and CRM", body: "Employees, clients, leads and roles, with each company's data isolated." },
      { title: "Training and documents", body: "Training modules, knowledge checks and shared files." },
      { title: "Reports for the owner", body: "Time reports, project progress and performance summaries." },
      { title: "Connect AI", body: "An optional MCP connection that gives AI tools the same permissions as the signed-in user." },
    ],
    operator: "By TLBISBIG Consulting Group, LLC · SME Digital Business Solutions.",
    primary: { label: "Visit WSSO", href: "https://wsso.tlbisbig.world" },
    secondary: { label: "See WSSO plans", href: "#pricing" },
    omniforce: "Buy WSSO for an organization and assign seats from OmniForce. WSSO sign-in through OmniForce is not configured yet; use your WSSO login.",
  },
  {
    key: "workforce",
    name: "Workforce 2.0",
    site: "https://workforce.trackmystartup.com",
    siteLabel: "workforce.trackmystartup.com",
    eyebrow: "Workforce 2.0 · Desktop app",
    headline: "Recruit your AI workforce.",
    subhead: "An AI workforce that finishes the job.",
    summary:
      "A desktop app for Windows, Linux and Android. Tell the assistant what you need by voice or typing; AI workers use real tools and ask for your approval before anything is sent, published or spent. Files and memory stay on your computer.",
    chips: [
      { label: "Windows", title: "Available on" },
      { label: "Linux", title: "Available on" },
      { label: "Android", title: "Available on" },
      { label: "Connects to 36 apps", title: "Integrations" },
    ],
    features: [
      { title: "Whole-job engines", body: "Sales, marketing, inbox and replies, competitor prices, video studio and job applications." },
      { title: "You approve first", body: "Read-only, draft-only or send permissions per app, and every decision is logged." },
      { title: "Local document index", body: "Documents are indexed offline on your machine as plain files you can edit." },
      { title: "Shared company memory", body: "Notes, decisions and conversations sync across the company and are searchable." },
      { title: "Voice-first", body: "Talk to it, interrupt it, hand work between team members, record meetings." },
      { title: "Task-based pricing", body: "Plans count finished tasks, not tokens. Chat and voice aren't counted." },
    ],
    operator: "Mac version not available yet.",
    primary: { label: "Download free", href: "https://workforce.trackmystartup.com" },
    secondary: { label: "See Workforce plans", href: "#pricing" },
    omniforce: "OmniForce can issue Workforce 2.0 licence keys for your account. Activation from the desktop app isn't live yet.",
  },
];

export const platform = [
  { title: "One OmniForce ID", body: "A permanent account ID across every product. Changing your email never breaks access." },
  { title: "Organizations and roles", body: "Owner, admin, billing and member roles with explicit, audited permissions." },
  { title: "Seats you control", body: "Buy a product for your organization and choose who gets a seat." },
  { title: "One place to pay", body: "Subscriptions, invoices and payment methods handled by Stripe." },
  { title: "Invitations that can't be forwarded", body: "Single-use links that only work for the invited, verified email address." },
  { title: "Sign in with OmniForce", body: "Standards-based OpenID Connect with PKCE, switched on product by product once each is ready." },
];

/** Truthful integration status. Update only when a product's side is live. */
export const status: { item: string; state: "available" | "not_configured" | "not_live"; note: string }[] = [
  { item: "OmniForce account, organizations and billing", state: "available", note: "Sign up, verify your email, create organizations, invite people, buy plans." },
  { item: "Drone Directory sign-in through OmniForce", state: "not_configured", note: "Keep using your Directory login." },
  { item: "WSSO sign-in through OmniForce", state: "not_configured", note: "Keep using your WSSO login." },
  { item: "Workforce 2.0 licence activation", state: "not_live", note: "Download and use Workforce 2.0 from its own site." },
];

export const signupSteps = [
  { title: "Create your account", body: "Name, email and password. You get one OmniForce ID." },
  { title: "Verify your email", body: "Enter the 6-digit code we send you." },
  { title: "Choose plans", body: "For yourself or for an organization, monthly or yearly." },
  { title: "Invite your team", body: "Add people to your organization and give them seats." },
];

export type Plan = {
  module: ModuleKey | "bundle";
  name: string;
  monthly: number | null; // USD; null = quote / see site
  note: string;
  seats?: string;
  placeholder?: boolean;
  featured?: boolean;
  /** Plans sold on the product's own site link there instead of OmniForce sign-up. */
  external?: { label: string; href: string };
  priceLabel?: string;
  noYearly?: boolean;
};

const WF = "https://workforce.trackmystartup.com";

export const plans: Plan[] = [
  // Drone Directory: plan names from the Directory's listing categories; paid prices are placeholders.
  { module: "directory", name: "Scout", monthly: 0, note: "Browse the directory" },
  { module: "directory", name: "Recreational Pilot", monthly: 0, note: "Basic pilot profile" },
  { module: "directory", name: "Commercial Pilot", monthly: 19, note: "Pilot listing with reviews", placeholder: true },
  { module: "directory", name: "Service Provider", monthly: 49, note: "Company listing with services", placeholder: true, featured: true },
  { module: "directory", name: "Vendor", monthly: 79, note: "Product and equipment listings", placeholder: true },
  { module: "directory", name: "Employer / Contractor", monthly: 99, note: "Post jobs and find pilots", placeholder: true },
  // WSSO: prices from wsso.tlbisbig.world
  { module: "wsso", name: "Starter", monthly: 99, seats: "10 seats", note: "Small teams · 14-day trial" },
  { module: "wsso", name: "Growth", monthly: 299, seats: "50 seats", note: "Typical SMB · 14-day trial", featured: true },
  { module: "wsso", name: "Business", monthly: 699, seats: "150 seats", note: "Larger organizations" },
  { module: "wsso", name: "Enterprise", monthly: 1500, seats: "500 seats", note: "Custom seats" },
  // Workforce 2.0: from workforce.trackmystartup.com; sold there.
  { module: "workforce", name: "Free", monthly: 0, note: "300 tasks a month with your own free Google AI key", noYearly: true, external: { label: "Download free", href: WF } },
  { module: "workforce", name: "Basic", monthly: 19.99, note: "1,000 tasks a month, with history and memory", featured: true, noYearly: true, external: { label: "Get Basic", href: WF } },
  { module: "workforce", name: "Pro", monthly: null, priceLabel: "See site", note: "More tasks for heavier use", noYearly: true, external: { label: "View plan", href: WF } },
  { module: "workforce", name: "Enterprise", monthly: null, priceLabel: "See site", note: "For teams and companies", noYearly: true, external: { label: "View plan", href: WF } },
  // Bundles: placeholders
  { module: "bundle", name: "Directory + WSSO", monthly: 329, note: "Service Provider + WSSO Growth", placeholder: true, featured: true },
  { module: "bundle", name: "All products", monthly: null, note: "Directory, WSSO and Workforce 2.0", seats: "Quote" },
];

export const faqs = [
  {
    q: "Can I sign in to the Directory or WSSO with my OmniForce account today?",
    a: "Not yet. Single sign-on is not configured for the Drone Directory or WSSO. Keep using their own logins. OmniForce already manages your account, organizations, plans and access, and sign-in will be switched on one product at a time once each product's team has built and tested it.",
  },
  {
    q: "What happens to my existing Directory listing or WSSO workspace?",
    a: "Nothing changes: your listing, profile and workspace data stay where they are. When single sign-on goes live we link your existing account only after you prove it's yours by signing in to it. A matching email alone is never enough.",
  },
  {
    q: "What is Workforce 2.0?",
    a: "A desktop AI workforce for Windows, Linux and Android. You ask for work by voice or typing, AI workers do it with real tools, and nothing is sent, published or paid for without your approval. It's downloaded and priced on workforce.trackmystartup.com.",
  },
  {
    q: "Can I buy for my team?",
    a: "Yes. Create an organization, buy a plan billed to it, invite people and give each person a seat. Owners and billing members manage payment; admins manage people and seats.",
  },
  {
    q: "Can I upgrade, downgrade or cancel one product?",
    a: "Yes. Each product is its own line on your subscription. Changes take effect at the end of the billing period unless you upgrade, which applies straight away.",
  },
  {
    q: "Who handles payments?",
    a: "Stripe. OmniForce never sees or stores your card details. Invoices are kept in your account.",
  },
];
