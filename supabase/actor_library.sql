-- Optional shared library of Claude-designed actor recipes for Type-a-Disaster.
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- If you created an earlier version (Meshy or Poly Pizza columns), drop it first:
--   drop table if exists public.actor_library;

create table if not exists public.actor_library (
  key           text primary key,          -- e.g. 'teh-tarik-glass'
  name          text not null,             -- display label
  recipe        jsonb not null,            -- Claude's design: {motion, parts: [...]}
  requested_by  text,                      -- hashed visitor id, for the per-visitor cap
  uses          integer not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists actor_library_created_at on public.actor_library (created_at);
create index if not exists actor_library_uses on public.actor_library (uses desc);

-- The game server uses the service-role key (which bypasses RLS). Anyone else
-- may only read.
alter table public.actor_library enable row level security;
drop policy if exists "Read actors" on public.actor_library;
create policy "Read actors" on public.actor_library for select using (true);
