-- Run this script in the Supabase SQL Editor after creating a project.
-- Authentication users own their profiles, businesses, and saved campaigns.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider_place_id text,
  name text not null,
  address text,
  category text,
  rating numeric(2, 1),
  review_count integer not null default 0,
  source_label text,
  created_at timestamptz not null default now(),
  unique(owner_id, provider_place_id)
);

alter table public.businesses add column if not exists source_label text;

create table if not exists public.public_business_listings (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 160),
  category text not null check (char_length(category) between 2 and 100),
  address text not null check (char_length(address) between 2 and 240),
  short_description text not null default '',
  website text check (website is null or (char_length(website) <= 300 and website ~* '^https?://[^[:space:]]+[.][^[:space:]]+$')),
  source_label text not null default 'Owner submitted',
  created_at timestamptz not null default now()
);

alter table public.public_business_listings add column if not exists short_description text not null default '';
alter table public.public_business_listings drop constraint if exists public_business_listings_short_description_check;
alter table public.public_business_listings add constraint public_business_listings_short_description_check
  check (short_description = '' or char_length(short_description) between 20 and 600);

create unique index if not exists public_business_listings_name_address_idx
  on public.public_business_listings (lower(name), lower(address));

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete set null,
  platform text not null check (platform in ('instagram', 'facebook', 'linkedin')),
  tone text not null,
  title text not null,
  caption text not null,
  hashtags jsonb not null default '[]'::jsonb,
  poster_headline text,
  poster_subhead text,
  review_highlight text,
  source_reviews jsonb not null default '[]'::jsonb,
  image_prompt text,
  campaign_strategy jsonb not null default '{}'::jsonb,
  image_url text,
  generation_mode text not null default 'gemini' check (generation_mode in ('demo', 'gemini', 'openai', 'template')),
  created_at timestamptz not null default now()
);

-- Keep existing projects compatible if this schema is run again after table creation.
alter table public.campaigns add column if not exists poster_headline text;
alter table public.campaigns add column if not exists poster_subhead text;
alter table public.campaigns add column if not exists generation_mode text not null default 'gemini';
alter table public.campaigns alter column generation_mode set default 'gemini';
alter table public.campaigns add column if not exists source_reviews jsonb not null default '[]'::jsonb;
alter table public.campaigns add column if not exists campaign_strategy jsonb not null default '{}'::jsonb;
alter table public.campaigns drop constraint if exists campaigns_generation_mode_check;
alter table public.campaigns add constraint campaigns_generation_mode_check
  check (generation_mode in ('demo', 'gemini', 'openai', 'template'));
create index if not exists campaigns_owner_created_at_idx on public.campaigns (owner_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.campaigns enable row level security;
alter table public.public_business_listings enable row level security;

-- The publishable browser key can access rows only for the signed-in owner.
grant select, insert, update, delete on public.profiles, public.businesses, public.campaigns to authenticated;
revoke all on public.public_business_listings from anon, authenticated;
grant select (id, name, category, address, short_description, website, source_label, created_at)
  on public.public_business_listings to anon, authenticated;
grant insert (created_by, name, category, address, short_description, website)
  on public.public_business_listings to authenticated;
grant update (name, category, address, short_description, website)
  on public.public_business_listings to authenticated;
grant delete on public.public_business_listings to authenticated;

drop policy if exists "Users manage their own profile" on public.profiles;
create policy "Users manage their own profile"
  on public.profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users manage their own businesses" on public.businesses;
create policy "Users manage their own businesses"
  on public.businesses for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "Users manage their own campaigns" on public.campaigns;
create policy "Users manage their own campaigns"
  on public.campaigns for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "Anyone can read owner-submitted listings" on public.public_business_listings;
create policy "Anyone can read owner-submitted listings"
  on public.public_business_listings for select
  using (true);

drop policy if exists "Owners submit their own public listings" on public.public_business_listings;
create policy "Owners submit their own public listings"
  on public.public_business_listings for insert to authenticated
  with check (auth.uid() = created_by);

drop policy if exists "Owners update their own public listings" on public.public_business_listings;
create policy "Owners update their own public listings"
  on public.public_business_listings for update to authenticated
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

drop policy if exists "Owners remove their own public listings" on public.public_business_listings;
create policy "Owners remove their own public listings"
  on public.public_business_listings for delete to authenticated
  using (auth.uid() = created_by);
