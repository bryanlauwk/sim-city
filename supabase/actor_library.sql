-- Shared library of custom actors for Type-a-Disaster.
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- If you ran the earlier Meshy version, drop that table first:
--   drop table if exists public.actor_library;

create table if not exists public.actor_library (
  key           text primary key,          -- e.g. 'teh-tarik-glass'
  name          text not null,             -- display label
  source        text not null check (source in ('recipe', 'polypizza')),
  recipe        jsonb,                     -- Claude's primitive design (source = 'recipe')
  model_url     text,                      -- GLB in the 'actors' bucket (source = 'polypizza')
  attribution   text,                      -- credit line for CC-BY models
  license       text,
  requested_by  text,                      -- hashed visitor id, for the per-visitor cap
  uses          integer not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists actor_library_created_at on public.actor_library (created_at);
create index if not exists actor_library_uses on public.actor_library (uses desc);

-- The game server uses the service-role key (which bypasses RLS). Anyone else
-- may only read.
alter table public.actor_library enable row level security;
drop policy if exists "Read ready actors" on public.actor_library;
drop policy if exists "Read actors" on public.actor_library;
create policy "Read actors" on public.actor_library for select using (true);

-- Public bucket for re-hosted Poly Pizza models.
insert into storage.buckets (id, name, public)
values ('actors', 'actors', true)
on conflict (id) do nothing;
