-- Separate public directory for listings submitted by their owner or an authorized representative.
-- Listing details are public; only the submitting account can create, edit, or remove its rows.
begin;

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

alter table public.public_business_listings enable row level security;
revoke all on public.public_business_listings from anon, authenticated;
grant select (id, name, category, address, short_description, website, source_label, created_at)
  on public.public_business_listings to anon, authenticated;
grant insert (created_by, name, category, address, short_description, website)
  on public.public_business_listings to authenticated;
grant update (name, category, address, short_description, website)
  on public.public_business_listings to authenticated;
grant delete on public.public_business_listings to authenticated;

drop policy if exists "Anyone can read owner-submitted listings" on public.public_business_listings;
create policy "Anyone can read owner-submitted listings"
  on public.public_business_listings for select using (true);

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

commit;
