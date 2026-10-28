-- Run this in the Supabase SQL Editor for the existing Banty Moore project.
-- Existing tables may already exist. This script is intended for that project; review before running.
create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.teams (
  id bigint generated always as identity primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  team_id bigint not null references public.teams(id),
  full_name text not null,
  jersey_number integer,
  registration_status text not null default 'pending' check (registration_status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);
create table if not exists public.matches (
  id bigint generated always as identity primary key,
  home_team_id bigint not null references public.teams(id),
  away_team_id bigint not null references public.teams(id),
  kickoff timestamptz,
  venue text,
  home_score integer,
  away_score integer,
  status text not null default 'scheduled' check (status in ('scheduled','played','postponed')),
  created_at timestamptz not null default now(),
  check (home_team_id <> away_team_id),
  check (home_score is null or home_score >= 0),
  check (away_score is null or away_score >= 0)
);
create table if not exists public.goals (
  id bigint generated always as identity primary key,
  match_id bigint not null references public.matches(id),
  player_id uuid not null references public.players(id),
  goal_time text,
  created_at timestamptz not null default now()
);
create table if not exists public.cards (
  id bigint generated always as identity primary key,
  match_id bigint not null references public.matches(id),
  player_id uuid not null references public.players(id),
  card_type text not null check (card_type in ('yellow','red')),
  card_time text,
  created_at timestamptz not null default now()
);
create table if not exists public.team_registration_tokens (
  id bigint generated always as identity primary key,
  team_id bigint not null unique references public.teams(id) on delete cascade,
  token_hash text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.goals enable row level security;
alter table public.cards enable row level security;
alter table public.team_registration_tokens enable row level security;

-- Public read policies. Drop/recreate named policies for repeatable setup.
drop policy if exists teams_public_read on public.teams;
create policy teams_public_read on public.teams for select to anon, authenticated using (true);
drop policy if exists players_public_approved_read on public.players;
create policy players_public_approved_read on public.players for select to anon, authenticated using (registration_status = 'approved');
drop policy if exists matches_public_read on public.matches;
create policy matches_public_read on public.matches for select to anon, authenticated using (true);
drop policy if exists goals_public_read on public.goals;
create policy goals_public_read on public.goals for select to anon, authenticated using (true);
drop policy if exists cards_public_read on public.cards;
create policy cards_public_read on public.cards for select to anon, authenticated using (true);
drop policy if exists admin_self_read on public.admin_users;
create policy admin_self_read on public.admin_users for select to authenticated using (user_id = auth.uid());
drop policy if exists teams_admin_write on public.teams;
create policy teams_admin_write on public.teams for all to authenticated using (exists(select 1 from public.admin_users a where a.user_id=auth.uid())) with check (exists(select 1 from public.admin_users a where a.user_id=auth.uid()));
drop policy if exists players_admin_write on public.players;
create policy players_admin_write on public.players for all to authenticated using (exists(select 1 from public.admin_users a where a.user_id=auth.uid())) with check (exists(select 1 from public.admin_users a where a.user_id=auth.uid()));
drop policy if exists matches_admin_write on public.matches;
create policy matches_admin_write on public.matches for all to authenticated using (exists(select 1 from public.admin_users a where a.user_id=auth.uid())) with check (exists(select 1 from public.admin_users a where a.user_id=auth.uid()));
drop policy if exists goals_admin_write on public.goals;
create policy goals_admin_write on public.goals for all to authenticated using (exists(select 1 from public.admin_users a where a.user_id=auth.uid())) with check (exists(select 1 from public.admin_users a where a.user_id=auth.uid()));
drop policy if exists cards_admin_write on public.cards;
create policy cards_admin_write on public.cards for all to authenticated using (exists(select 1 from public.admin_users a where a.user_id=auth.uid())) with check (exists(select 1 from public.admin_users a where a.user_id=auth.uid()));
drop policy if exists team_tokens_admin_write on public.team_registration_tokens;
create policy team_tokens_admin_write on public.team_registration_tokens for all to authenticated using (exists(select 1 from public.admin_users a where a.user_id=auth.uid())) with check (exists(select 1 from public.admin_users a where a.user_id=auth.uid()));

-- A registration token is hashed in the browser before it is stored.
create or replace function public.submit_team_registration(p_token text, p_players jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team_id bigint;
  v_team_name text;
  v_item jsonb;
  v_count integer;
  v_name text;
  v_jersey integer;
  v_new_count integer := 0;
begin
  if pg_catalog.now() >= '2026-11-05 19:00:00+01'::timestamptz then
    raise exception 'The registration deadline has passed.';
  end if;
  if p_token is null or length(p_token) < 20 then raise exception 'Invalid team registration link.'; end if;
  if p_players is null or pg_catalog.jsonb_typeof(p_players) <> 'array' then raise exception 'Invalid player list.'; end if;
  if pg_catalog.jsonb_array_length(p_players) < 1 or pg_catalog.jsonb_array_length(p_players) > 6 then
    raise exception 'Submit between 1 and 6 players at a time.';
  end if;
  select t.id,t.name into v_team_id,v_team_name
  from public.team_registration_tokens tok join public.teams t on t.id=tok.team_id
  where tok.token_hash = encode(extensions.digest(p_token, 'sha256'),'hex') and tok.active = true;
  if v_team_id is null then raise exception 'Invalid or inactive team registration link.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(v_team_id);
  select count(*)::integer into v_count from public.players
    where team_id=v_team_id and registration_status in ('pending','approved');
  if v_count + pg_catalog.jsonb_array_length(p_players) > 6 then
    raise exception 'This team has room for only % more player(s).', greatest(0,6-v_count);
  end if;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_players)
  loop
    v_name := pg_catalog.btrim(v_item->>'full_name');
    if v_name is null or length(v_name)<2 or length(v_name)>100 then raise exception 'Each player name must be between 2 and 100 characters.'; end if;
    if nullif(v_item->>'jersey_number','') is not null then
      begin v_jersey := (v_item->>'jersey_number')::integer;
      exception when others then raise exception 'Jersey number must be a whole number.'; end;
      if v_jersey < 0 or v_jersey > 999 then raise exception 'Jersey number must be between 0 and 999.'; end if;
    else v_jersey := null; end if;
    insert into public.players(team_id,full_name,jersey_number,registration_status)
    values(v_team_id,v_name,v_jersey,'pending');
    v_new_count := v_new_count + 1;
  end loop;
  return pg_catalog.jsonb_build_object('team_name',v_team_name,'submitted',v_new_count);
end;
$$;
revoke all on function public.submit_team_registration(text,jsonb) from public;
grant execute on function public.submit_team_registration(text,jsonb) to anon, authenticated;

-- Do not enable broad anonymous INSERT/UPDATE policies. Registration goes only through the RPC above.
-- Confirm the authorized admin user is present in public.admin_users before using admin.html.
