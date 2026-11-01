-- Run after schema.sql in Supabase SQL Editor. Keeps campaign modes compatible
-- and prepares private, per-user campaign image storage.
begin;

alter table public.campaigns
  drop constraint if exists campaigns_generation_mode_check;

alter table public.campaigns
  add constraint campaigns_generation_mode_check
  check (generation_mode in ('demo', 'gemini', 'openai', 'template'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campaign-images', 'campaign-images', false, 12582912, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users read their campaign images" on storage.objects;
create policy "Users read their campaign images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'campaign-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users upload their campaign images" on storage.objects;
create policy "Users upload their campaign images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'campaign-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users replace their campaign images" on storage.objects;
create policy "Users replace their campaign images"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'campaign-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'campaign-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

commit;
