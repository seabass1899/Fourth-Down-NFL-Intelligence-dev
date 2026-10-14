-- FourthDown P0.1 foundation. Execute in a separate NEW Supabase project.
-- Subscriber data is isolated by auth.uid() RLS. Never disable RLS in production.
create extension if not exists pgcrypto;
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text,
 created_at timestamptz not null default now()
);
create table if not exists public.teams (
 id text primary key, name text not null, conference text, division text,
 created_at timestamptz not null default now()
);
create table if not exists public.players (
 id text primary key, team_id text references public.teams(id), full_name text not null,
 position text, updated_at timestamptz not null default now()
);
create table if not exists public.games (
 id text primary key, season integer not null, week integer not null,
 home_team_id text not null references public.teams(id), away_team_id text not null references public.teams(id),
 kickoff timestamptz not null, status text not null default 'scheduled',
 home_score integer, away_score integer, updated_at timestamptz not null default now()
);
create table if not exists public.odds_snapshots (
 id uuid primary key default gen_random_uuid(), provider text not null, sportsbook text not null,
 external_event_id text, external_market_id text, market text not null,
 selection text not null, american_odds integer not null check (american_odds <= -100 or american_odds >= 100),
 captured_at timestamptz not null, source_license text, created_at timestamptz not null default now(),
 unique(provider,sportsbook,external_event_id,external_market_id,selection,captured_at)
);
create table if not exists public.model_predictions (
 id uuid primary key default gen_random_uuid(), game_id text references public.games(id), player_id text references public.players(id),
 model_name text not null, model_version text not null, market text not null,
 predicted_value numeric, estimated_probability numeric check (estimated_probability between 0 and 1),
 created_at timestamptz not null default now(), source_notes text
);
create table if not exists public.wagers (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 event_label text not null, event_date date not null, selections text not null,
 market text not null, sportsbook text not null,
 american_odds integer not null check (american_odds <= -100 or american_odds >= 100),
 stake numeric(12,2) not null check (stake>0),
 result text not null default 'pending' check(result in ('pending','win','loss','push','void')),
 actual_total_return numeric(12,2) check(actual_total_return>=0), notes text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists wagers_user_date_idx on public.wagers(user_id,event_date desc);
create table if not exists public.saved_research (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 title text not null, content jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.subscriber_entitlements (
 user_id uuid primary key references auth.users(id) on delete cascade,
 tier text not null default 'free' check(tier in ('free','pro','elite')),
 valid_until timestamptz, updated_at timestamptz not null default now()
);
-- All public tables RLS-enabled. Public sports datasets deliberately inaccessible to anon until licensed import is ready.
alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.games enable row level security;
alter table public.odds_snapshots enable row level security;
alter table public.model_predictions enable row level security;
alter table public.wagers enable row level security;
alter table public.saved_research enable row level security;
alter table public.subscriber_entitlements enable row level security;
create policy "Read own profile" on public.profiles for select to authenticated using (id=(select auth.uid()));
create policy "Update own profile" on public.profiles for update to authenticated using (id=(select auth.uid())) with check (id=(select auth.uid()));
create policy "Read own wagers" on public.wagers for select to authenticated using (user_id=(select auth.uid()));
create policy "Insert own wagers" on public.wagers for insert to authenticated with check (user_id=(select auth.uid()));
create policy "Update own wagers" on public.wagers for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy "Delete own wagers" on public.wagers for delete to authenticated using (user_id=(select auth.uid()));
create policy "Read own saved research" on public.saved_research for select to authenticated using (user_id=(select auth.uid()));
create policy "Insert own saved research" on public.saved_research for insert to authenticated with check (user_id=(select auth.uid()));
create policy "Update own saved research" on public.saved_research for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy "Delete own saved research" on public.saved_research for delete to authenticated using (user_id=(select auth.uid()));
create policy "Read own entitlements" on public.subscriber_entitlements for select to authenticated using (user_id=(select auth.uid()));
-- No authenticated entitlement write policy: billing must be reconciled by a privileged trusted backend.
-- No anonymous/public read on licensed data tables. Future vetted API can selectively grant read access.
