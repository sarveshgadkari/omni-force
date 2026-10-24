-- Plan catalogue. Set stripe_price_id after creating prices in Stripe.
-- Directory external_ref = DirectoryUp subscription_id (Scout 1, Provider 2, Standard 3, Pro 5, Recreational 6).
-- Paid Directory and bundle prices are placeholders.

insert into public.plans (code, name, module_key, bundle_modules, interval, price_cents, external_ref, seats, trial_days, sort) values
  ('dir_scout',               'Scout',                 'directory', '{}', 'free',  0,     '1',                   null, 0,  10),
  ('dir_recreational',        'Recreational Pilot',    'directory', '{}', 'free',  0,     '6',                   null, 0,  11),
  ('dir_commercial_month',    'Commercial Pilot',      'directory', '{}', 'month', 1900,  '3',                   null, 0,  12),
  ('dir_provider_month',      'Service Provider',      'directory', '{}', 'month', 4900,  '2',                   null, 0,  13),
  ('dir_vendor_month',        'Vendor',                'directory', '{}', 'month', 7900,  '5',                   null, 0,  14),
  ('dir_employer_month',      'Employer / Contractor', 'directory', '{}', 'month', 9900,  '5',                   null, 0,  15),
  ('wsso_starter_month',      'Starter',               'wsso',      '{}', 'month', 9900,  'starter',             10,   14, 20),
  ('wsso_growth_month',       'Growth',                'wsso',      '{}', 'month', 29900, 'growth',              50,   14, 21),
  ('wsso_business_month',     'Business',              'wsso',      '{}', 'month', 69900, 'business',            150,  0,  22),
  ('wsso_enterprise_month',   'Enterprise',            'wsso',      '{}', 'month', 150000,'enterprise',          500,  0,  23),
  ('wf_single_license',       'Single site',           'workforce', '{}', 'license', 0,   'single',              null, 0,  30),
  ('wf_multi_license',        'Multi site',            'workforce', '{}', 'license', 0,   'multi',               null, 0,  31),
  ('bundle_dir_wsso_month',   'Directory + WSSO',      null, '{directory,wsso}', 'month', 32900, '2|growth', 50, 14, 40)
on conflict (code) do nothing;

-- Yearly variants (10× monthly)
insert into public.plans (code, name, module_key, bundle_modules, interval, price_cents, external_ref, seats, trial_days, sort)
select replace(code, '_month', '_year'), name, module_key, bundle_modules, 'year', price_cents * 10, external_ref, seats, trial_days, sort
from public.plans where interval = 'month'
on conflict (code) do nothing;

-- Make Henry and Trence platform admins once they have signed up:
-- insert into public.platform_admins (user_id) select id from public.profiles where email in ('henry@…', 'trence@…');
