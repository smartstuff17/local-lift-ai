-- Safe additive migration for saved campaign objectives and review insights.
-- Existing campaign rows receive an empty strategy object; no records are removed.
alter table public.campaigns
  add column if not exists campaign_strategy jsonb not null default '{}'::jsonb;
