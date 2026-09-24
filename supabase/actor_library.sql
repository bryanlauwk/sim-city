-- Shared library of generated actors for Type-a-Disaster.
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query).

create table if not exists public.actor_library (
  key            text primary key,          -- e.g. 'teh-tarik-glass'
  name           text not null,             -- display label
  prompt         text not null,             -- what Meshy was asked to make
  color          text not null default '#888888',
  status         text not null default 'pending'
                   check (status in ('pending', 'ready', 'failed')),
  meshy_task_id  text,
  model_url      text,                      -- public URL in the 'actors' bucket
  requested_by   text,                      -- hashed visitor id, for the per-visitor cap
  uses           integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists actor_library_created_at on public.actor_library (created_at);

-- The game server uses the service-role key (which bypasses RLS). Anyone else
-- may only read finished models.
alter table public.actor_library enable row level security;
drop policy if exists "Read ready actors" on public.actor_library;
create policy "Read ready actors" on public.actor_library
  for select using (status = 'ready');

-- Public bucket for the generated GLB files.
insert into storage.buckets (id, name, public)
values ('actors', 'actors', true)
on conflict (id) do nothing;
