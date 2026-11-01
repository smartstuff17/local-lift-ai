-- Add editable public descriptions to the separate owner-submitted directory.
-- Existing listings remain valid with an empty description until their owners update them.
begin;

alter table public.public_business_listings
  add column if not exists short_description text not null default '';

alter table public.public_business_listings
  drop constraint if exists public_business_listings_short_description_check;
alter table public.public_business_listings
  add constraint public_business_listings_short_description_check
  check (short_description = '' or char_length(short_description) between 20 and 600);

grant select (short_description)
  on public.public_business_listings to anon, authenticated;
grant insert (short_description)
  on public.public_business_listings to authenticated;
grant update (short_description)
  on public.public_business_listings to authenticated;

commit;
