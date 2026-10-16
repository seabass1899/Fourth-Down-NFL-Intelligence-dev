-- P0.2: run AFTER the original foundation migration.
-- A wager's selections text remains for backward compatibility.
create table if not exists public.wager_legs (
 id uuid primary key default gen_random_uuid(),
 wager_id uuid not null references public.wagers(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 leg_order integer not null check (leg_order>=1),
 player_name text,
 market text not null,
 selection text not null,
 threshold numeric,
 status text not null default 'pending' check(status in ('pending','win','loss','push','void')),
 created_at timestamptz not null default now(),
 unique(wager_id,leg_order)
);
create index if not exists wager_legs_owner_idx on public.wager_legs(user_id,wager_id);
-- Prevent mismatched user_id / wager_id associations even if inserted through direct REST.
create or replace function public.validate_wager_leg_owner() returns trigger language plpgsql set search_path = '' as $$
begin
 if not exists (select 1 from public.wagers w where w.id=new.wager_id and w.user_id=new.user_id) then
  raise exception 'wager leg owner mismatch';
 end if;
 return new;
end $$;
drop trigger if exists wager_leg_owner_check on public.wager_legs;
create trigger wager_leg_owner_check before insert or update on public.wager_legs for each row execute function public.validate_wager_leg_owner();
alter table public.wager_legs enable row level security;
create policy "read own wager legs" on public.wager_legs for select to authenticated using (user_id=(select auth.uid()));
create policy "insert own wager legs" on public.wager_legs for insert to authenticated with check (user_id=(select auth.uid()));
create policy "update own wager legs" on public.wager_legs for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy "delete own wager legs" on public.wager_legs for delete to authenticated using (user_id=(select auth.uid()));
-- An audit-ready event table. Updates/deletes intentionally not granted to subscribers.
create table if not exists public.wager_settlement_events (
 id uuid primary key default gen_random_uuid(),
 wager_id uuid not null references public.wagers(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 recorded_at timestamptz not null default now(),
 result text not null check (result in ('pending','win','loss','push','void')),
 total_return numeric(12,2) check (total_return>=0),
 notes text
);
alter table public.wager_settlement_events enable row level security;
create policy "read own settlement events" on public.wager_settlement_events for select to authenticated using (user_id=(select auth.uid()));
-- Writing immutable audit entries is reserved for an upcoming trusted service role implementation.
